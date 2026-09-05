import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  MAX_NODE_MINUTES,
  MapAnswers,
  LlmTask,
  MapQuestionSet,
  MapShape,
  MapShapeInput,
  mapShapeOf,
  MoveDirection,
  MoveDirectionSchema,
  SUMMARY_MAX,
  TopicContentSettingsInput,
  TopicCreateInput,
  TopicInfoInput,
  TopicQuestionsInput,
  TopicRegenerateInput,
  TopicStatus,
  TopicSummary,
  answeredQuestions,
  contentSettingsOf,
  newId,
  uniqueSlug,
} from "@interestled/schemas";
import type {
  AnsweredQuestionT,
  GeneratedMapT,
  TextTask,
  LearningNodeT,
  MapAnswersT,
  MapPlanViewT,
  TopicT,
} from "@interestled/schemas";
import { ancestorsOf, isBranch, subtreeShapeOf } from "@interestled/domain";
import { z } from "zod";
import type { AuthEnv } from "./auth";
import type { Db } from "./db";
import { getLimits } from "./env";
import { ConflictError, NotFoundError } from "./errors";
import {
  effectiveMapInstructions,
  generateMap,
  seedContentInstructions,
  seedMapInstructions,
  generateMapQuestions,
  generateSubtree,
} from "./llm";
import type { LlmProvider, MapQuestionsInput } from "./llm";
import { insertNodes, loadTopicDetail, prepareNodes } from "./maps";
import { loadProfile } from "./profile";
import { toNode, toTopic } from "./rows";

/** Persist a generated map, replacing whatever the topic had before. */
async function saveMap(db: Db, topic: TopicT, map: GeneratedMapT): Promise<void> {
  const { rows, edges } = prepareNodes({
    topicId: topic.id,
    archetype: map.archetype,
    generated: map.nodes,
    parentId: null,
    parentPath: null,
    takenSlugs: new Set(),
    firstOrderIndex: 0,
  });
  await insertNodes(db, rows);
  await db.nodePrerequisite.createMany({ data: edges, skipDuplicates: true });
  await db.topic.update({
    where: { id: topic.id },
    data: { archetype: map.archetype, status: TopicStatus.Ready },
  });
}

/**
 * The hour a ceiling counts over. Every one of them is "in the last hour", so
 * the window is written once.
 */
function hourAgo(): Date {
  return new Date(Date.now() - 60 * 60 * 1000);
}

/**
 * One ceiling, checked only if the deployment set it.
 *
 * The counts are lazy for the same reason: an unset ceiling is one nothing can
 * be refused for, so counting the rows it would have compared against is a
 * query paid on every card, question and press for an answer nobody reads.
 * With none of them set — which is the default, see LimitsSchema — a generating
 * request makes no budget query at all.
 */
async function assertUnder(
  limit: number | undefined,
  count: () => Promise<number>,
  refusal: (limit: number) => string,
): Promise<void> {
  if (limit === undefined) {
    return;
  }
  if ((await count()) >= limit) {
    throw new ConflictError(refusal(limit));
  }
}

/**
 * The hour's card writing, against its ceiling — every card, however it came to
 * be written, because the model spend is the same either way and a rewrite
 * measured against its own share of it would ignore the reading that used the
 * rest. Only rewrites are checked: reading is bounded by how many nodes there
 * are, so refusing it would only ever mean refusing to show the next node.
 */
export async function assertRewriteBudget(db: Db, userId: string): Promise<void> {
  await assertUnder(
    getLimits().MAX_CARDS_WRITTEN_PER_HOUR,
    () =>
      db.conceptCard.count({
        where: { node: { topic: { userId } }, createdAt: { gte: hourAgo() } },
      }),
    () => "That is a lot of card writing in one hour — the limit resets shortly.",
  );
}

/** Recordings a learner may have made in an hour, when that is capped at all. */
export async function assertNarrationBudget(db: Db, userId: string): Promise<void> {
  await assertUnder(
    getLimits().MAX_NARRATIONS_PER_HOUR,
    // Runs started, not rows. There is one row per card, and a card that fails
    // every time is taken over again on each press — counting rows, a learner
    // holding down retry on a broken card would never reach the ceiling while
    // spending two model calls a press. `attempts` on a row claimed inside the
    // hour may include presses from before it, which over-counts slightly and in
    // the safe direction.
    async () => {
      const recent = await db.cardNarration.aggregate({
        where: { card: { node: { topic: { userId } } }, createdAt: { gte: hourAgo() } },
        _sum: { attempts: true },
      });
      return recent._sum.attempts ?? 0;
    },
    () => "That is a lot of cards read out in one hour — the limit resets shortly.",
  );
}

/**
 * Questions a learner may ask in an hour. The same shape of ceiling as the
 * rewrites above, for the same reason: an answer is a model call per press, and
 * nothing else bounds it — a card is written once per settings and a drill once
 * per node, but a question can be asked as many times as there is a button.
 */
export async function assertQuestionBudget(db: Db, userId: string): Promise<void> {
  await assertUnder(
    getLimits().MAX_QUESTIONS_PER_HOUR,
    () =>
      db.cardQuestion.count({ where: { node: { topic: { userId } }, createdAt: { gte: hourAgo() } } }),
    () => "That is a lot of questions in one hour — the limit resets shortly.",
  );
}

/**
 * Which of the three model calls this is about, so each counter guards the call
 * that actually spends the tokens.
 *
 * `plan` is deliberately not checked on the build routes. The plan cap has to
 * stop someone generating a thirty-first set of questions; if it also stopped
 * the build, a learner who had just answered seven questions would be told they
 * could not have the map they answered them for.
 */
interface BudgetFor {
  /** Creating a topic, or asking the questions for one. */
  newTopic: boolean;
  /** Asking the seven questions, whether or not a topic exists yet. */
  newPlan: boolean;
}

/**
 * The map ceilings, in the order it is worth being told about them, and each
 * one skipped when the deployment has not set it.
 *
 * One after another rather than in parallel: with nothing set this makes no
 * query at all, and with something set the first refusal is the answer, so the
 * counts after it would be spent working out how much else was also over.
 *
 * Nodes rather than topics is the load-bearing one. A rebuild — of a whole map,
 * or of one group, as often as you like — creates no topic, so a topic count
 * would leave every rebuild outside the budget entirely.
 */
async function assertWithinBudget(db: Db, userId: string, about: BudgetFor): Promise<void> {
  const limits = getLimits();
  if (about.newTopic) {
    await assertUnder(
      limits.MAX_TOPICS_PER_HOUR,
      () => db.topic.count({ where: { userId, createdAt: { gte: hourAgo() } } }),
      (limit) => `That is ${limit} new topics in an hour — the limit resets shortly.`,
    );
    await assertUnder(
      limits.MAX_TOPICS_PER_USER,
      () => db.topic.count({ where: { userId } }),
      (limit) => `You have reached ${limit} topics. Delete one to add another.`,
    );
  }
  await assertUnder(
    limits.MAX_GENERATED_NODES_PER_HOUR,
    () => db.learningNode.count({ where: { topic: { userId }, createdAt: { gte: hourAgo() } } }),
    () => "That is a lot of map building in one hour — the limit resets shortly.",
  );
  if (about.newPlan) {
    await assertUnder(
      limits.MAX_MAP_PLANS_PER_HOUR,
      () => db.mapPlan.count({ where: { userId, createdAt: { gte: hourAgo() } } }),
      () => "That is a lot of maps started in one hour — the limit resets shortly.",
    );
  }
}

/**
 * The first line of the goal, as the topic's opening summary. The topics list
 * has to say something about a topic without opening it, and this is what that
 * list already showed — so a new topic reads the same as it used to and the
 * learner edits it from there, rather than being asked for one more answer
 * before the map they came for (A14).
 */
function summaryFromGoal(goal: string): string {
  // Cut before it is parsed: a first line past the limit is a long goal, not a
  // bad one, and refusing the whole create over a derived field would be absurd.
  return TopicSummary.parse((goal.split("\n")[0] ?? "").trim().slice(0, SUMMARY_MAX));
}

/** A slug that is free for this user. Topic titles repeat, so this is normal. */
async function freeTopicSlug(db: Db, userId: string, title: string): Promise<string> {
  const rows = await db.topic.findMany({ where: { userId }, select: { slug: true } });
  return uniqueSlug(title, new Set(rows.map((row) => row.slug)), "topic-map");
}

async function findTopic(db: Db, userId: string, slug: string): Promise<TopicT> {
  const row = await db.topic.findFirst({ where: { userId, slug } });
  if (row === null) {
    throw new NotFoundError("Topic not found");
  }
  return toTopic(row);
}

/**
 * Generate and store the map. Returns null on success, or the message to show
 * the learner — the topic row always survives, so a failure is visible and
 * retryable rather than the create silently vanishing.
 */
async function buildMap(
  db: Db,
  provider: LlmProvider,
  topic: TopicT,
  answered: readonly AnsweredQuestionT[],
): Promise<string | null> {
  try {
    const map = await generateMap(provider, {
      title: topic.title,
      goal: topic.goal,
      level: topic.level,
      shape: mapShapeOf(topic),
      // The stored lines when the learner wrote some, the seed when they did
      // not. Read off the topic rather than passed in, so a rebuild uses what
      // the topic now says rather than what it said when it was created.
      mapInstructions: effectiveMapInstructions(topic),
      content: contentSettingsOf(topic),
      answered,
      // Read here rather than passed in, so a rebuild picks up a profile edited
      // since the topic was created — which is a common reason to rebuild.
      profile: await loadProfile(db, topic.userId),
    });
    await saveMap(db, topic, map);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    await db.topic.update({
      where: { id: topic.id },
      data: { status: TopicStatus.Failed, error: message },
    });
    return message;
  }
}

const Instructions = z.object({ instructions: z.string().trim().max(600).default("") });

/**
 * Ask the model for the seven questions, and keep the row they came from.
 *
 * The row is what the answers come back against: an answer is "the second
 * option of the outline question", which only means anything beside the four
 * options the learner was actually shown. Generating the questions again to
 * interpret an answer would interpret it against four different options.
 */
async function createPlan(
  db: Db,
  provider: LlmProvider,
  userId: string,
  topicId: string | null,
  input: Omit<MapQuestionsInput, "profile">,
): Promise<MapPlanViewT> {
  const questions = await generateMapQuestions(provider, {
    ...input,
    profile: await loadProfile(db, userId),
  });
  const row = await db.mapPlan.create({ data: { id: newId(), userId, topicId, questions } });
  return { planId: row.id, questions };
}

/**
 * The answers, resolved against the questions they were given for.
 *
 * A plan id belonging to someone else is a 404 like every other row in this
 * product — there are no roles, so ownership is the whole of authorisation. No
 * plan id at all is fine and means no choices were made: the build goes ahead
 * and the map prompt says nothing about them.
 */
async function resolveChoices(
  db: Db,
  userId: string,
  planId: string | undefined,
  answers: MapAnswersT,
): Promise<AnsweredQuestionT[]> {
  if (planId === undefined) {
    assertNoOrphanAnswers(answers);
    return [];
  }
  const row = await db.mapPlan.findFirst({ where: { id: planId, userId } });
  if (row === null) {
    throw new NotFoundError("Those choices are no longer available — answer them again.");
  }
  // Parsed rather than trusted: the column is Json, which is the one shape
  // Prisma cannot describe, so this is the boundary where it becomes typed.
  return answeredQuestions(MapQuestionSet.parse(row.questions), answers);
}

/**
 * Answers with no plan id name options nobody can look up — "the second one" of
 * a set of four this request never says. Refusing beats building a map that
 * silently ignores every pick the learner made.
 */
function assertNoOrphanAnswers(answers: MapAnswersT): void {
  if (answers.length > 0) {
    throw new ConflictError("Those choices arrived without their questions — answer them again.");
  }
}

/** How far back a retry looks for the answers the failed build was made from. */
const RECENT_PLANS = 5;

/**
 * The choices behind a rebuild: the ones the learner has just answered, or —
 * when the build carries no plan at all — the ones the last build of this topic
 * used.
 *
 * The fallback is what makes "Try again" after a failed generation honest. That
 * screen says rebuilding uses the answers already given, and the plan is linked
 * to the topic before the map is generated, so a build that died still left the
 * seven answers behind. Without this the retry would quietly build a different
 * map from the one that failed.
 */
async function rebuildChoices(
  db: Db,
  userId: string,
  topicId: string,
  planId: string | undefined,
  answers: MapAnswersT,
): Promise<AnsweredQuestionT[]> {
  if (planId !== undefined) {
    const answered = await resolveChoices(db, userId, planId, answers);
    await linkPlan(db, userId, planId, topicId, answers);
    return answered;
  }
  assertNoOrphanAnswers(answers);
  // The most recent plan that was actually answered, rather than simply the most
  // recent: opening the rebuild sheet writes a plan, and closing it again leaves
  // that unanswered row sitting on top of the one the last build used.
  const previous = await db.mapPlan.findMany({
    where: { userId, topicId },
    orderBy: { createdAt: "desc" },
    take: RECENT_PLANS,
  });
  for (const plan of previous) {
    // safeParse here and a throwing parse in resolveChoices, because the two are
    // reading rows of different ages. There the learner answered seconds ago and
    // an unreadable row means something is wrong now; here the row can be weeks
    // old and written by a build before MapQuestionKind last changed, and
    // refusing it would leave that topic unable to be rebuilt at all.
    const questions = MapQuestionSet.safeParse(plan.questions);
    const answered = MapAnswers.safeParse(plan.answers);
    if (questions.success && answered.success && answered.data.length > 0) {
      return answeredQuestions(questions.data, answered.data);
    }
  }
  return [];
}

/**
 * Record what was answered, and which topic the plan ended up building. Kept
 * apart from resolveChoices because the topic does not exist yet when a new
 * topic's answers are read — the row is linked once it does.
 */
async function linkPlan(
  db: Db,
  userId: string,
  planId: string | undefined,
  topicId: string,
  answers: MapAnswersT,
): Promise<void> {
  if (planId === undefined) {
    return;
  }
  // Scoped by owner like every other write here, even though resolveChoices has
  // already refused a plan belonging to anyone else.
  await db.mapPlan.updateMany({ where: { id: planId, userId }, data: { topicId, answers } });
}

/**
 * Every model call in this file builds map structure — the seven choices, the
 * whole map, and one group of it — so every one of them asks for the map model.
 */
export function topicsRouter(db: Db, provider: (task: TextTask) => LlmProvider): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();

  router.get("/", async (c) => {
    const rows = await db.topic.findMany({
      where: { userId: c.get("userId") },
      orderBy: { createdAt: "desc" },
    });
    return c.json(rows.map(toTopic));
  });

  /**
   * The default content instructions, so the settings screen can show what is in
   * force before the learner has written anything. It is a prompt, so it lives
   * in src/llm/prompts as Markdown and is read from there rather than copied
   * into the client — one of them would go stale, and it would be this one.
   *
   * Registered before "/:slug", and "defaults" is a reserved slug, so no topic
   * can ever be parked behind this address.
   */
  router.get("/defaults", (c) => {
    // Taken from the input schema rather than restated, so there is one place a
    // default can be changed and no way for the screen to show a different one
    // from the one a save would actually apply.
    const content = TopicContentSettingsInput.parse({});
    return c.json({ ...content, contentInstructions: seedContentInstructions(content.paragraphLength) });
  });

  /**
   * The seven questions asked before a new topic's map is built.
   *
   * It answers with the questions and the row they were saved as; the answers
   * come back to POST "/" carrying that id, so each answer is read against the
   * four options the learner was actually shown.
   *
   * "questions" is one segment, like "defaults", and the only other one-segment
   * POST here is the create itself — so this cannot be shadowed by a topic slug.
   */
  router.post("/questions", zValidator("json", TopicCreateInput), async (c) => {
    const input = c.req.valid("json");
    const userId = c.get("userId");
    await assertWithinBudget(db, userId, { newTopic: true, newPlan: true });
    return c.json(
      await createPlan(db, provider(LlmTask.Map), userId, null, {
        title: input.title,
        goal: input.goal,
        level: input.level,
        content: TopicContentSettingsInput.parse({}),
        mapInstructions: effectiveMapInstructions(input),
      }),
    );
  });

  /**
   * The same seven questions before a rebuild. They are generated again rather
   * than reused, because the shape and the instruction lines may have changed
   * since the last build and the options are about the map being asked for.
   *
   * The map being replaced is deliberately not sent. The learner is describing
   * the map they want, not editing the one they have, and showing the model the
   * old one only invites it to offer that back as one of the four.
   */
  router.post("/:slug/questions", zValidator("json", TopicQuestionsInput), async (c) => {
    const userId = c.get("userId");
    const topic = await findTopic(db, userId, c.req.param("slug"));
    const input = c.req.valid("json");
    await assertWithinBudget(db, userId, { newTopic: false, newPlan: true });
    return c.json(
      await createPlan(db, provider(LlmTask.Map), userId, topic.id, {
        title: topic.title,
        goal: topic.goal,
        level: topic.level,
        content: contentSettingsOf(topic),
        mapInstructions: effectiveMapInstructions(input),
      }),
    );
  });

  /**
   * The instruction lines a set of shape settings seeds, so the create and
   * rebuild screens can show them in the box before anything exists to store
   * them on. It is a prompt, so it lives in src/llm/prompts as Markdown and is
   * rendered from there rather than rebuilt in the client — one of the two would
   * go stale, and it would be this one.
   */
  router.post("/map-instructions", zValidator("json", MapShapeInput), (c) =>
    c.json({ mapInstructions: seedMapInstructions(c.req.valid("json")) }),
  );

  /**
   * The same for the content side. Separate from GET "/defaults" because that
   * one answers for the defaults and this one answers for the setting the
   * learner is looking at — a screen showing "4-5 sentences" while the topic is
   * set to long is the screen lying about what the model gets.
   */
  router.post(
    "/content-instructions",
    zValidator("json", TopicContentSettingsInput.pick({ paragraphLength: true })),
    (c) => c.json({ contentInstructions: seedContentInstructions(c.req.valid("json").paragraphLength) }),
  );

  /**
   * Creating a topic generates its map inline. It is one call and the learner
   * has nothing to do until it lands, so a background job would only add a
   * polling screen — the client shows a skeleton instead.
   */
  router.post("/", zValidator("json", TopicCreateInput), async (c) => {
    const input = c.req.valid("json");
    const userId = c.get("userId");
    await assertWithinBudget(db, userId, { newTopic: true, newPlan: false });
    // Before the topic row, so a plan id that is not theirs costs them nothing
    // and leaves no half-made topic behind.
    const answered = await resolveChoices(db, userId, input.planId, input.answers);
    const created = await db.topic.create({
      data: {
        id: newId(),
        userId,
        slug: await freeTopicSlug(db, userId, input.title),
        title: input.title,
        summary: summaryFromGoal(input.goal),
        goal: input.goal,
        // Overwritten by the generated map; a placeholder keeps the column typed.
        archetype: "tool",
        level: input.level,
        ...mapShapeOf(input),
        // Stored as the learner left it: "" means the seed applies and moving a
        // chip later re-seeds, and text means they wrote it and it stands.
        mapInstructions: input.mapInstructions,
        status: TopicStatus.Generating,
      },
    });
    await linkPlan(db, userId, input.planId, created.id, input.answers);
    const failure = await buildMap(db, provider(LlmTask.Map), toTopic(created), answered);
    if (failure !== null) {
      return c.json({ error: failure, topicSlug: created.slug }, 502);
    }
    return c.json(toTopic(await db.topic.findUniqueOrThrow({ where: { id: created.id } })), 201);
  });

  /**
   * Build the map again — after a failure, or because the learner read it and
   * wants it different. The shape and the instruction lines are saved before the
   * build, so the rebuild sheet shows the same text next time and the topic says
   * what it was actually built to.
   */
  router.post("/:slug/regenerate", zValidator("json", TopicRegenerateInput), async (c) => {
    const userId = c.get("userId");
    const topic = await findTopic(db, userId, c.req.param("slug"));
    const input = c.req.valid("json");
    await assertWithinBudget(db, userId, { newTopic: false, newPlan: false });
    const answered = await rebuildChoices(db, userId, topic.id, input.planId, input.answers);
    // Nodes from the previous map would collide with the new ones on the path
    // constraint, and the cascade takes their cards and drills with them.
    await db.learningNode.deleteMany({ where: { topicId: topic.id } });
    // What the request said, over what the topic already said. A rebuild that
    // named no shape is asking for the same map again, not for the defaults.
    const shape = { ...mapShapeOf(topic), ...MapShape.partial().parse(input) };
    const rebuilt = toTopic(
      await db.topic.update({
        where: { id: topic.id },
        data: {
          status: TopicStatus.Generating,
          error: null,
          ...shape,
          mapInstructions: input.mapInstructions ?? topic.mapInstructions,
        },
      }),
    );
    const failure = await buildMap(db, provider(LlmTask.Map), rebuilt, answered);
    if (failure !== null) {
      return c.json({ error: failure, topicSlug: topic.slug }, 502);
    }
    return c.json(toTopic(await db.topic.findUniqueOrThrow({ where: { id: topic.id } })));
  });

  /** The map, its progress, and the restore point — the whole topic screen. */
  router.get("/:slug", async (c) => {
    const userId = c.get("userId");
    const topic = await findTopic(db, userId, c.req.param("slug"));
    return c.json(await loadTopicDetail(db, userId, topic));
  });

  /**
   * What the topic is and what the learner wants from it. None of it regenerates
   * anything: the answers change what the *next* generation reads, and the map
   * already on screen is left exactly as it was — rebuilding on an edit would
   * throw away every node already verified, which is the one thing the edit
   * screen exists to avoid.
   */
  router.put("/:slug/info", zValidator("json", TopicInfoInput), async (c) => {
    const userId = c.get("userId");
    const topic = await findTopic(db, userId, c.req.param("slug"));
    const input = c.req.valid("json");
    const updated = await db.topic.update({
      where: { id: topic.id },
      data: {
        title: input.title,
        // Kept rather than re-derived: an empty box means the learner cleared it,
        // and re-seeding from the goal would put back what they just deleted.
        summary: input.summary,
        goal: input.goal,
        level: input.level,
      },
    });
    return c.json(toTopic(updated));
  });

  /**
   * Standing instructions for everything generated inside this topic.
   *
   * Cards already written are kept. They used to be dropped here, so that the
   * next open of any node showed the new settings — and the next open of every
   * node was then a model call and a thirty-second wait, whether or not the
   * reader wanted this card different. Now a node whose card was written to the
   * old settings answers with that card, and the panel under it says the
   * settings have moved; writing it again is one press, and the reader's to
   * make. The card route is where that happens (cardFor in learning.ts).
   *
   * Drills are kept for the older reason: deleting one cascades to the attempts
   * made against it, and those are the learner's own record of what they
   * answered.
   */
  router.put("/:slug/content-settings", zValidator("json", TopicContentSettingsInput), async (c) => {
    const userId = c.get("userId");
    const topic = await findTopic(db, userId, c.req.param("slug"));
    const input = c.req.valid("json");
    // Read off the schema rather than listed by hand. Written out, the list had
    // already gone stale once — paragraphLength was never compared, so a save
    // that moved only that chip answered "nothing changed" and stored nothing —
    // and the voice below would have been the second. Every member is a scalar,
    // so === is the whole of the comparison.
    const unchanged = TopicContentSettingsInput.keyof().options.every(
      (key) => input[key] === topic[key],
    );
    if (unchanged) {
      return c.json(topic);
    }
    const updated = await db.topic.update({ where: { id: topic.id }, data: input });
    if (input.averageReadTime !== topic.averageReadTime) {
      await rescaleMinutes(db, topic.id, topic.averageReadTime, input.averageReadTime);
    }
    return c.json(toTopic(updated));
  });

  router.delete("/:slug", async (c) => {
    const result = await db.topic.deleteMany({
      where: { slug: c.req.param("slug"), userId: c.get("userId") },
    });
    if (result.count === 0) {
      throw new NotFoundError("Topic not found");
    }
    return c.body(null, 204);
  });

  /**
   * Rebuild what sits under one group. Everything else on the map — including
   * the learner's status on every node outside this group — is untouched, which
   * is the point: a map you can correct in one place is one you keep, and
   * "regenerate everything" is a thing people only press once.
   */
  router.post("/:slug/nodes/:nodeId/regenerate", zValidator("json", Instructions), async (c) => {
    const userId = c.get("userId");
    const topic = await findTopic(db, userId, c.req.param("slug"));
    const { nodes, node } = await loadMapNode(db, topic, c.req.param("nodeId"));
    if (!isBranch(node, nodes)) {
      throw new ConflictError("That is a node, not a group — there is nothing under it to rebuild.");
    }
    await assertWithinBudget(db, userId, { newTopic: false, newPlan: false });

    const siblings = nodes.filter(
      (candidate) => candidate.parentId === node.parentId && candidate.id !== node.id,
    );
    const generated = await generateSubtree(
      provider(LlmTask.Map),
      {
        topic,
        trail: [...ancestorsOf(node, nodes).map((row) => row.title), node.title],
        claim: node.claim,
        siblingTitles: siblings.map((row) => row.title),
        profile: await loadProfile(db, userId),
        instructions: c.req.valid("json").instructions,
        // What this group holds today is what it gets back: the top of a
        // three-level map is rebuilt into groups with their nodes, and anything
        // one level above the leaves into nodes.
        shape: subtreeShapeOf(node, nodes),
      },
      node.id,
      node.depth + 1,
    );
    const { rows, edges } = prepareNodes({
      topicId: topic.id,
      archetype: topic.archetype,
      generated,
      parentId: node.id,
      parentPath: node.path,
      takenSlugs: new Set(),
      firstOrderIndex: 0,
    });
    // Delete first: the replacement reuses slugs, so both sets cannot be present
    // at once. The cascade takes the old cards, drills and review items too.
    await db.learningNode.deleteMany({ where: { parentId: node.id } });
    await insertNodes(db, rows);
    await db.nodePrerequisite.createMany({ data: edges, skipDuplicates: true });
    return c.json(await loadTopicDetail(db, userId, topic));
  });

  /**
   * Move a node one place among its siblings. Order is per level, so this swaps
   * exactly two rows and every other level keeps the order it had.
   */
  router.put(
    "/:slug/nodes/:nodeId/move",
    zValidator("json", z.object({ direction: MoveDirectionSchema })),
    async (c) => {
      const userId = c.get("userId");
      const topic = await findTopic(db, userId, c.req.param("slug"));
      const { nodes, node } = await loadMapNode(db, topic, c.req.param("nodeId"));
      const siblings = nodes
        .filter((candidate) => candidate.parentId === node.parentId)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      const at = siblings.findIndex((candidate) => candidate.id === node.id);
      const swapWith = siblings[c.req.valid("json").direction === MoveDirection.Up ? at - 1 : at + 1];
      // Already at the end of its level: answering with the map unchanged beats
      // an error, because the button is simply a no-op there.
      if (swapWith !== undefined) {
        await db.$transaction([
          db.learningNode.update({ where: { id: node.id }, data: { orderIndex: swapWith.orderIndex } }),
          db.learningNode.update({ where: { id: swapWith.id }, data: { orderIndex: node.orderIndex } }),
        ]);
      }
      return c.json(await loadTopicDetail(db, userId, topic));
    },
  );

  /** Delete a node, and everything under it. */
  router.delete("/:slug/nodes/:nodeId", async (c) => {
    const userId = c.get("userId");
    const topic = await findTopic(db, userId, c.req.param("slug"));
    const { node } = await loadMapNode(db, topic, c.req.param("nodeId"));
    // The self-relation cascades, so children, cards, drills and review items
    // all go with it. Nothing here is recoverable, which the client says first.
    await db.learningNode.delete({ where: { id: node.id } });
    return c.json(await loadTopicDetail(db, userId, topic));
  });

  return router;
}

/** One node plus the whole map it belongs to — every edit needs both. */
async function loadMapNode(
  db: Db,
  topic: TopicT,
  nodeId: string,
): Promise<{ nodes: LearningNodeT[]; node: LearningNodeT }> {
  const rows = await db.learningNode.findMany({
    where: { topicId: topic.id },
    include: { prerequisites: { select: { prerequisiteId: true } } },
    orderBy: { orderIndex: "asc" },
  });
  const nodes = rows.map(toNode);
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined) {
    throw new NotFoundError("Node not found");
  }
  return { nodes, node };
}


/**
 * Move the map's own minute estimates when the learner changes how long a node
 * should take.
 *
 * Without this the setting is half-applied: the next card is written to ten
 * minutes while every row on the map still says three, and the map is then
 * lying about what it costs — the one thing it may never do. The estimates are
 * scaled rather than flattened, so a node the model judged twice the length of
 * its neighbours stays twice the length of them.
 *
 * Branches are left alone: their time is the sum of the leaves under them, and
 * a heading is not something anybody sits down and reads.
 */
async function rescaleMinutes(
  db: Db,
  topicId: string,
  from: number,
  to: number,
): Promise<void> {
  const rows = await db.learningNode.findMany({ where: { topicId } });
  const parents = new Set(rows.map((row) => row.parentId).filter((id): id is string => id !== null));
  const factor = to / Math.max(1, from);
  const updates = rows
    .filter((row) => !parents.has(row.id) && row.minutes > 0)
    .map((row) => ({
      id: row.id,
      was: row.minutes,
      minutes: Math.max(1, Math.min(MAX_NODE_MINUTES, Math.round(row.minutes * factor))),
    }))
    .filter((row) => row.minutes !== row.was);
  if (updates.length === 0) {
    return;
  }
  await db.$transaction(
    updates.map((row) =>
      db.learningNode.update({ where: { id: row.id }, data: { minutes: row.minutes } }),
    ),
  );
}
