import { Hono } from "hono";
import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  AttemptInput,
  CardAngleSchema,
  CardContent,
  CardDepth,
  CardInstructionsInput,
  CardMinutes,
  CardQuestionInput,
  ContentFormatSchema,
  DrillKind,
  DrillKindSchema,
  EnglishLevelSchema,
  LlmTask,
  NarrationStatus,
  NodeStatus,
  NodeStatusSchema,
  ParagraphLengthSchema,
  TechnicalDetailSchema,
  cardVariant,
  contentSettingsOf,
  newId,
  parseCardVariant,
} from "@interestled/schemas";
import type { CardContentT, CardSettingsT, LearningNodeT, TextTask, TopicT } from "@interestled/schemas";
import {
  advance,
  cardMinutes,
  defaultCardSettings,
  masteryDrill,
  missingPrerequisites,
  nextDefaultDepth,
} from "@interestled/domain";
import type { AuthEnv } from "./auth";
import type { Db } from "./db";
import { ConflictError, NotFoundError } from "./errors";
import { generateAnswer, generateAtoms, generateCard, generateDrill, gradeAttempt } from "./llm";
import { EARLIER_QUESTIONS } from "./llm/prompts";
import type { LlmProvider, SpeechProvider } from "./llm";
import { loadProfile } from "./profile";
import { readNarration, startNarration } from "./narration";
import type { Background, NarrationTarget } from "./narration";
import type { ObjectStore } from "./storage";
import { assertQuestionBudget, assertRewriteBudget } from "./topics";
import { toCardQuestion, toDrill, toNode, toTopic } from "./rows";

async function loadNode(
  db: Db,
  userId: string,
  nodeId: string,
): Promise<{ node: LearningNodeT; topic: TopicT }> {
  const row = await db.learningNode.findFirst({
    where: { id: nodeId, topic: { userId } },
    include: { prerequisites: { select: { prerequisiteId: true } }, topic: true },
  });
  if (row === null) {
    throw new NotFoundError("Node not found");
  }
  return { node: toNode(row), topic: toTopic(row.topic) };
}

/**
 * A group has no card and no drill — it is a heading, and the screens route to
 * its children instead. Refusing here rather than trusting the client is worth
 * the line: generating a card is a model call, and a deep link to a group URL is
 * the kind of thing that happens by hand.
 */
async function refuseGroup(db: Db, node: LearningNodeT): Promise<void> {
  const children = await db.learningNode.count({ where: { parentId: node.id } });
  if (children > 0) {
    throw new ConflictError(`"${node.title}" is a group. Open one of the nodes inside it.`);
  }
}

/**
 * How a card is asked for. Three ways, because there are three things a caller
 * can mean, and a boolean could only tell two of them apart.
 */
enum CardLookup {
  /**
   * The card at exactly these settings: read it if it is cached, write it if
   * not. What the controls under a card ask for, since a chip moved to somewhere
   * new is a request for the card that lives there.
   */
  Exact = "exact",
  /**
   * The card at these settings if it is cached — otherwise whatever card this
   * node already has, and only when it has none, write one. What a plain open of
   * a node asks for, and what the drill and the review items are written
   * against: the card the learner actually read. This is the whole of what
   * makes regeneration manual. The topic's settings moving, or the learner's
   * depth, changes which key a plain open looks under; answering the miss with
   * the card that exists, and saying what it was written to, is what turns
   * "every node you open is written again" into a note and a button.
   */
  Written = "written",
  /**
   * Write it again at these settings, whatever is cached. Generation is not
   * deterministic, so the same request twice is a genuinely different card —
   * which is the whole of what the control offers, and why it cannot be served
   * from the cache it is asking to go around.
   */
  Rewrite = "rewrite",
}

/** What a caller gets back: the card, and what it was actually written to. */
export interface WrittenCard {
  content: CardContentT;
  settings: CardSettingsT;
}

/** The columns a cached row has to say what it is. */
interface CardRow {
  depth: number;
  variant: string;
  instructions: string;
  content: unknown;
}

/**
 * A row as the card it holds and the settings it was written to, or null for a
 * row that cannot say — one from an earlier prompt revision, which bumping the
 * revision is meant to retire.
 */
function writtenCard(row: CardRow): WrittenCard | null {
  const settings = parseCardVariant(row.variant, row.depth, row.instructions);
  return settings === null ? null : { content: CardContent.parse(row.content), settings };
}

/**
 * The newest card this node has, at any settings: the one the learner last read.
 * Newest rather than nearest, because "the card you were looking at" is a rule a
 * reader can predict and "the closest match" is not. Null when the node has none
 * at all, or none from this prompt revision.
 *
 * Exported because it is the whole of what a public read may do — that side has
 * no provider to generate with, and this is the lookup that cannot.
 */
export async function newestCard(db: Db, nodeId: string): Promise<WrittenCard | null> {
  const latest = await db.conceptCard.findFirst({
    where: { nodeId },
    orderBy: { createdAt: "desc" },
  });
  return latest === null ? null : writtenCard(latest);
}

/**
 * Cards are cached per (node, depth, variant), which is what lets a depth button
 * answer instantly instead of costing a wait — and a depth control that costs a
 * wait is one nobody presses.
 *
 * The cache is per learner without needing to say so in the key: a node belongs
 * to one topic, which belongs to one user, so no two accounts ever share a node
 * id. That is what makes it safe to write the card against this learner's
 * profile. It also means an edited profile does not rewrite cards already
 * generated — the same as changing the topic's own answers.
 *
 * A hit is answered with the settings the row was written to, not the ones
 * asked for. The two differ in one place: the instructions, which are not in
 * the key. A row found at its key with other instructions on it is still the
 * card the learner has, and the panel says so; nothing is written until asked.
 */
async function cardFor(
  db: Db,
  provider: LlmProvider,
  userId: string,
  topic: TopicT,
  node: LearningNodeT,
  settings: CardSettingsT,
  lookup: CardLookup,
): Promise<WrittenCard> {
  const key = { nodeId: node.id, depth: settings.depth, variant: cardVariant(settings) };
  if (lookup === CardLookup.Rewrite) {
    // The one generating call a learner can repeat without bound: every other
    // one either creates nodes or is answered from the cache the second time.
    await assertRewriteBudget(db, userId);
  } else {
    const cached = await db.conceptCard.findUnique({ where: { nodeId_depth_variant: key } });
    if (cached !== null) {
      return {
        content: CardContent.parse(cached.content),
        settings: { ...settings, instructions: cached.instructions },
      };
    }
    if (lookup === CardLookup.Written) {
      const existing = await newestCard(db, node.id);
      if (existing !== null) {
        return existing;
      }
    }
  }
  // Read only on a miss. A hit is the normal case, and neither the profile nor
  // the rest of the map is needed anywhere but the prompt, so this must not
  // become two queries on every card view.
  const [profile, rows] = await Promise.all([
    loadProfile(db, userId),
    db.learningNode.findMany({ where: { topicId: topic.id } }),
  ]);
  // The whole map goes to the prompt: a card written from its own title alone
  // re-explains the nodes before it and spends the ones after it.
  const content = await generateCard(provider, {
    topic,
    node,
    nodes: rows.map(toNode),
    settings,
    profile,
  });
  // Two concurrent readers of the same uncached card both generate, and the
  // slower insert would collide on the unique key. The row is identical either
  // way, so treat the collision as the cache hit it effectively is — except on
  // a rewrite, which exists precisely to replace what is there. createdAt moves
  // with the content, because it is what the rewrite budget counts and a row
  // that keeps its original date is a rewrite the ceiling never sees. The
  // instructions move with it too: they are what this writing was asked for.
  await db.conceptCard.upsert({
    where: { nodeId_depth_variant: key },
    create: { id: newId(), ...key, instructions: settings.instructions, content },
    update:
      lookup === CardLookup.Rewrite
        ? { content, instructions: settings.instructions, createdAt: new Date() }
        : {},
  });
  // A rewrite moves the row's createdAt with its content, which is also what
  // retires the recording made from the old text: card_narrations stores the
  // date it recorded, and a row that no longer matches is never served. It is
  // marked stale rather than deleted on purpose — those rows in the last hour
  // are the narration ceiling, and a counter this endpoint could empty is one a
  // learner could empty by pressing Regenerate between presses of play.
  return { content, settings };
}

/**
 * The controls under a card, each optional. What the learner has not overridden
 * comes from the topic and the node, so the plain URL still returns the plain
 * card — and an override travels in the query rather than being stored, because
 * it is a thing they wanted once, on one node, not a new setting for the topic.
 *
 * The card's instructions are the exception and are not here: they are the
 * node's own text, saved on it, so they hold for the next writing too.
 */
const CardQuery = z.object({
  depth: z.coerce.number().int().min(1).max(5).optional(),
  minutes: z.coerce.number().int().pipe(CardMinutes).optional(),
  englishLevel: EnglishLevelSchema.optional(),
  technicalDetail: TechnicalDetailSchema.optional(),
  format: ContentFormatSchema.optional(),
  paragraphLength: ParagraphLengthSchema.optional(),
  angle: CardAngleSchema.optional(),
  /**
   * Write this one again at the settings it already has. The literal rather than
   * a coerced boolean: `Boolean("false")` is true, so a client saying it does
   * not want a rewrite would get one — which costs a model call and throws away
   * the card the reader was looking at.
   */
  rewrite: z.literal("1").optional(),
});

type CardQueryT = z.infer<typeof CardQuery>;

function settingsFrom(
  query: CardQueryT,
  topic: TopicT,
  node: LearningNodeT,
  defaultDepth: number,
): CardSettingsT {
  const base = defaultCardSettings(topic, node, query.depth ?? defaultDepth);
  return {
    ...base,
    // An explicit length wins over what the map promised for this node: "longer"
    // is the learner asking for more of it now, and a control the node's own
    // estimate can veto is a control that does nothing.
    minutes: query.minutes === undefined ? base.minutes : cardMinutes(query.minutes),
    englishLevel: query.englishLevel ?? base.englishLevel,
    technicalDetail: query.technicalDetail ?? base.technicalDetail,
    format: query.format ?? base.format,
    paragraphLength: query.paragraphLength ?? base.paragraphLength,
    angle: query.angle ?? base.angle,
  };
}

/**
 * Which card the play button is on.
 *
 * Every setting, and none of them optional: these are what the card route
 * answered as `settings`, and they are the only thing that names one of a
 * node's cards rather than another. Defaulting any of them would resolve to a
 * card the reader is not looking at, which is a recording of the wrong text.
 */
const AudioQuery = z.object({
  depth: z.coerce.number().int().pipe(CardDepth),
  minutes: z.coerce.number().int().pipe(CardMinutes),
  englishLevel: EnglishLevelSchema,
  technicalDetail: TechnicalDetailSchema,
  format: ContentFormatSchema,
  paragraphLength: ParagraphLengthSchema,
  angle: CardAngleSchema,
});

type AudioQueryT = z.infer<typeof AudioQuery>;

/**
 * Which lookup a request is. A rewrite says so. Anything that moves a chip is
 * asking for the card at those settings exactly; a plain open is asking for the
 * card this node has.
 */
function lookupFor(query: CardQueryT): CardLookup {
  if (query.rewrite === "1") {
    return CardLookup.Rewrite;
  }
  const overridden =
    query.depth !== undefined ||
    query.minutes !== undefined ||
    query.englishLevel !== undefined ||
    query.technicalDetail !== undefined ||
    query.format !== undefined ||
    query.paragraphLength !== undefined ||
    query.angle !== undefined;
  return overridden ? CardLookup.Exact : CardLookup.Written;
}

/**
 * The node, the topic and the card the audio routes are about.
 *
 * The instructions are read off the node rather than sent, the same as
 * everywhere else: they are not in the cache key, so they play no part in
 * naming the card — but the prompt is given them, and they are the node's to
 * hold between writings.
 */
async function audioTarget(
  db: Db,
  c: Context<AuthEnv>,
  nodeId: string,
  query: AudioQueryT,
): Promise<NarrationTarget> {
  const userId = c.get("userId");
  const { node, topic } = await loadNode(db, userId, nodeId);
  await refuseGroup(db, node);
  return {
    userId,
    username: c.get("username"),
    topic,
    node,
    settings: { ...query, instructions: node.cardInstructions },
  };
}

/**
 * Every model call in this file writes inside a map the learner already has —
 * a card, a drill, a verdict, a review item — so every one of them asks for the
 * content model.
 */
export function learningRouter(
  db: Db,
  provider: (task: TextTask) => LlmProvider,
  /**
   * Both lazy, and both only ever reached by the two audio routes: a deployment
   * with no bucket and no speech model still serves every other route here, and
   * the press that needs them is the one that says so.
   */
  speech: () => SpeechProvider,
  objects: () => ObjectStore,
  /** Where a recording's generation goes once the press has been answered. */
  background: Background,
): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();

  /**
   * Opening a node marks it Seen and nothing more. Reading can never complete a
   * node, or the map stops being honest and everything resting on it collapses.
   */
  router.get("/:id/card", zValidator("query", CardQuery), async (c) => {
    const userId = c.get("userId");
    const { node, topic } = await loadNode(db, userId, c.req.param("id"));
    await refuseGroup(db, node);
    const query = c.req.valid("query");
    const asked = settingsFrom(query, topic, node, c.get("defaultDepth"));

    const card = await cardFor(
      db,
      provider(LlmTask.Content),
      userId,
      topic,
      node,
      asked,
      lookupFor(query),
    );

    if (node.status === NodeStatus.Untouched) {
      await db.learningNode.update({ where: { id: node.id }, data: { status: NodeStatus.Seen } });
    }
    // Depth follows the learner rather than resetting per node. It follows what
    // was asked for, not what was answered: a node answering with the card it
    // already has is not the learner choosing that depth.
    if (asked.depth !== c.get("defaultDepth")) {
      await db.user.update({
        where: { id: userId },
        data: {
          defaultDepth: nextDefaultDepth(CardDepth.parse(c.get("defaultDepth")), asked.depth),
        },
      });
    }

    const all = await db.learningNode.findMany({
      where: { topicId: topic.id },
      include: { prerequisites: { select: { prerequisiteId: true } } },
    });
    return c.json({
      node: { ...node, status: node.status === NodeStatus.Untouched ? NodeStatus.Seen : node.status },
      // Answered back, so the controls can show what the card was actually
      // written to rather than what was asked for — the two differ at the ends
      // of each scale, and they differ whenever the settings have moved since
      // this card was written.
      settings: card.settings,
      // What a plain open of this node writes to now: the topic's settings, the
      // node's own instructions, and the learner's depth. The panel compares
      // the card against this to say whether the settings have moved. From the
      // server rather than worked out on the phone, because the depth is here.
      defaults: defaultCardSettings(topic, node, c.get("defaultDepth")),
      content: card.content,
      // Advisory, never a gate: shown as a note with a link on the node itself.
      missingPrerequisites: missingPrerequisites(node, all.map(toNode)).map((row) => ({
        id: row.id,
        title: row.title,
        minutes: row.minutes,
      })),
    });
  });

  /**
   * What the learner wants for this node's card in particular. Saved on the
   * node and nothing written: the card on screen keeps its writing until the
   * button under it is pressed, the same as every other control there.
   */
  router.put("/:id/card-instructions", zValidator("json", CardInstructionsInput), async (c) => {
    const userId = c.get("userId");
    const { node } = await loadNode(db, userId, c.req.param("id"));
    await refuseGroup(db, node);
    const updated = await db.learningNode.update({
      where: { id: node.id },
      data: { cardInstructions: c.req.valid("json").instructions },
      include: { prerequisites: { select: { prerequisiteId: true } } },
    });
    return c.json(toNode(updated));
  });

  /** Everything asked on this card, oldest first, so the screen reads as it was asked. */
  router.get("/:id/questions", async (c) => {
    const userId = c.get("userId");
    const { node } = await loadNode(db, userId, c.req.param("id"));
    const rows = await db.cardQuestion.findMany({
      where: { nodeId: node.id },
      orderBy: { createdAt: "asc" },
    });
    return c.json(rows.map(toCardQuestion));
  });

  /**
   * A question asked on a card, answered against the card the learner is
   * reading — the one the node has, not a card written for the occasion — and
   * kept with the node. A model call per press, so it is inside its own budget.
   */
  router.post("/:id/questions", zValidator("json", CardQuestionInput), async (c) => {
    const userId = c.get("userId");
    const { node, topic } = await loadNode(db, userId, c.req.param("id"));
    await refuseGroup(db, node);
    await assertQuestionBudget(db, userId);
    const { question } = c.req.valid("json");

    const content = provider(LlmTask.Content);
    const [card, earlier, profile, rows] = await Promise.all([
      cardFor(
        db,
        content,
        userId,
        topic,
        node,
        defaultCardSettings(topic, node, c.get("defaultDepth")),
        CardLookup.Written,
      ),
      // Newest first off the index, then turned round: the prompt reads them in
      // the order they were asked.
      db.cardQuestion.findMany({
        where: { nodeId: node.id },
        orderBy: { createdAt: "desc" },
        take: EARLIER_QUESTIONS,
      }),
      loadProfile(db, userId),
      db.learningNode.findMany({ where: { topicId: topic.id } }),
    ]);
    const { answer } = await generateAnswer(content, {
      topic,
      node,
      nodes: rows.map(toNode),
      card: card.content,
      settings: card.settings,
      question,
      earlier: earlier.reverse().map(toCardQuestion),
      profile,
    });
    const created = await db.cardQuestion.create({
      data: { id: newId(), nodeId: node.id, question, answer },
    });
    return c.json(toCardQuestion(created), 201);
  });

  /**
   * Whether the card on screen has been read out, and where to play it from.
   *
   * A query rather than part of the card, because it is not part of the card:
   * the signed link expires, so this is asked again on every mount and every
   * return to the foreground, and folding it into the card route would put a
   * one-hour expiry inside a response cached for a day.
   *
   * The settings are required and are what the card route answered, because
   * they are the only thing that says which of a node's cards the button is on.
   * Null is every kind of "not yet", and all of them mean the same thing to it.
   */
  router.get("/:id/audio", zValidator("query", AudioQuery), async (c) => {
    const target = await audioTarget(db, c, c.req.param("id"), c.req.valid("query"));
    return c.json({ audio: await readNarration(db, objects, target) });
  });

  /**
   * Start reading this card out.
   *
   * The press is not the recording: a script and minutes of synthesis take far
   * longer than the sixty seconds CloudFront gives an origin, so this claims the
   * run, answers `202` with `pending`, and the app polls the route above until
   * the row settles. A recording already made comes back `200` and is the one
   * case that costs nothing.
   *
   * It is the most expensive press in the product, so it is inside its own
   * hourly ceiling — applied by startNarration only once it has decided there is
   * actually something to make.
   */
  router.post("/:id/audio", zValidator("query", AudioQuery), async (c) => {
    const target = await audioTarget(db, c, c.req.param("id"), c.req.valid("query"));
    const audio = await startNarration(
      db,
      provider(LlmTask.Content),
      speech(),
      objects,
      background,
      target,
    );
    // 202 says "accepted, still working", which is true of exactly one of the
    // three. A recording already made and a run that has already failed are
    // both the current state of the resource rather than something accepted.
    return c.json({ audio }, audio.status === NarrationStatus.Pending ? 202 : 200);
  });

  /** A drill of the requested kind, generated once per node and then reused. */
  router.get("/:id/drill", zValidator("query", z.object({ kind: DrillKindSchema.optional() })), async (c) => {
    const userId = c.get("userId");
    const { node, topic } = await loadNode(db, userId, c.req.param("id"));
    await refuseGroup(db, node);
    const kind = c.req.valid("query").kind ?? masteryDrill(node.archetype);

    const existing = await db.drill.findFirst({ where: { nodeId: node.id, kind } });
    if (existing !== null) {
      return c.json(toDrill(existing));
    }
    // Written against the card the learner read, whatever it was written to,
    // and not against a fresh one written for the drill: that would be the
    // regeneration the card route just declined to do, through a side door.
    const card = await cardFor(
      db,
      provider(LlmTask.Content),
      userId,
      topic,
      node,
      defaultCardSettings(topic, node, c.get("defaultDepth")),
      CardLookup.Written,
    );
    const generated = await generateDrill(provider(LlmTask.Content), {
      node,
      kind,
      card: card.content,
      content: contentSettingsOf(topic),
    });
    const created = await db.drill.create({
      data: { id: newId(), nodeId: node.id, kind, ...generated },
    });
    return c.json(toDrill(created));
  });

  /**
   * Grade an answer. This is the one call that is never cached: a cached verdict
   * would be a verdict on somebody else's answer.
   */
  router.post("/attempts", zValidator("json", AttemptInput), async (c) => {
    const userId = c.get("userId");
    const drillRow = await db.drill.findFirst({
      where: { id: c.req.valid("json").drillId, node: { topic: { userId } } },
      include: { node: { include: { prerequisites: { select: { prerequisiteId: true } }, topic: true } } },
    });
    if (drillRow === null) {
      throw new NotFoundError("Drill not found");
    }
    const input = c.req.valid("json");
    const drill = toDrill(drillRow);
    const node = toNode(drillRow.node);
    const topic = toTopic(drillRow.node.topic);

    const verdict = await gradeAttempt(provider(LlmTask.Content), {
      prompt: drill.prompt,
      referencePoints: drill.referencePoints,
      response: input.response,
    });

    const status = advance(node.status, verdict, {
      // The archetype decides which drill means "known", so a System topic
      // reaches Verified through Predict and a Tool topic through Apply.
      isMastery: drill.kind === masteryDrill(node.archetype),
      // A wrong guess before the reveal never costs the learner anything.
      penalise: drill.kind !== DrillKind.Predict,
    });
    const [attempt] = await db.$transaction([
      db.attempt.create({
        data: {
          id: newId(),
          drillId: drill.id,
          userId,
          response: input.response,
          verdict,
          hintsUsed: input.hintsUsed,
        },
      }),
      db.learningNode.update({ where: { id: node.id }, data: { status } }),
    ]);

    // Review items are extracted the first time a node is passed, so the
    // retention layer fills itself without a separate step.
    if (verdict.passed) {
      const existing = await db.atom.count({ where: { nodeId: node.id, userId } });
      if (existing === 0) {
        // Deliberately swallowed: the answer is already graded and the node has
        // already moved, so a model failure here must not turn a successful
        // attempt into an error the learner sees. The next pass retries it.
        const settings = defaultCardSettings(topic, node, c.get("defaultDepth"));
        await createAtoms(db, provider(LlmTask.Content), userId, topic, node, settings).catch((error: unknown) => {
          console.error("atom extraction failed", error);
        });
      }
    }
    return c.json({ attempt: { ...attempt, verdict }, status, capability: node.capability }, 201);
  });

  /** Manual status change: "I already know this", honoured without proof. */
  router.put(
    "/:id/status",
    zValidator("json", z.object({ status: NodeStatusSchema })),
    async (c) => {
      const userId = c.get("userId");
      const { node } = await loadNode(db, userId, c.req.param("id"));
      const updated = await db.learningNode.update({
        where: { id: node.id },
        data: { status: c.req.valid("json").status },
        include: { prerequisites: { select: { prerequisiteId: true } } },
      });
      return c.json(toNode(updated));
    },
  );

  return router;
}

async function createAtoms(
  db: Db,
  provider: LlmProvider,
  userId: string,
  topic: TopicT,
  node: LearningNodeT,
  settings: CardSettingsT,
): Promise<void> {
  // The card they just read, rather than a second generation of the same node
  // at whatever the settings are now.
  const card = await cardFor(db, provider, userId, topic, node, settings, CardLookup.Written);
  const atoms = await generateAtoms(provider, {
    node,
    card: card.content,
    content: contentSettingsOf(topic),
  });
  const now = new Date();
  await db.atom.createMany({
    data: atoms.map((atom) => ({
      id: newId(),
      nodeId: node.id,
      userId,
      kind: atom.kind,
      prompt: atom.prompt,
      answer: atom.answer,
      // Due tomorrow: the first retrieval is the one that matters most.
      dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    })),
  });
}
