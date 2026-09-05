import {
  CardContent,
  NARRATION_ERROR_MAX,
  NARRATION_TIMED_OUT,
  NARRATION_TIMEOUT_MS,
  NarrationStatus,
  NarrationStatusSchema,
  cardVariant,
  narrationKey,
  newId,
} from "@interestled/schemas";
import type {
  CardContentT,
  CardSettingsT,
  LearningNodeT,
  NarrationVoice,
  NodeAudioT,
  TopicT,
} from "@interestled/schemas";
import { pcmSeconds, pcmToWav, sampleRateOf } from "./audio/wav";
import type { Db } from "./db";
import { ConflictError } from "./errors";
import { generateNarration } from "./llm";
import type { LlmProvider, SpeechProvider } from "./llm";
import { AUDIO_URL_TTL_SECONDS } from "./storage";
import type { ObjectStore } from "./storage";
import { assertNarrationBudget } from "./topics";

/** What a WAV is served as. The bucket stores it; the player reads it back. */
const AUDIO_CONTENT_TYPE = "audio/wav";

/** Who is asking, what they are reading, and where the recording belongs. */
export interface NarrationTarget {
  userId: string;
  /** Off the session, not looked up: it never changes and it is already loaded. */
  username: string;
  topic: TopicT;
  node: LearningNodeT;
  /**
   * What the card on screen was written to, as the card route answered it.
   *
   * Named by the caller rather than resolved here as "the newest card this node
   * has". Those are not the same card: moving a chip writes a second card at
   * those settings and moving it back serves the first one again, so the newest
   * row is the one the reader just navigated away from. A recording is of the
   * card the button is on, and this is the only thing that says which that is.
   */
  settings: CardSettingsT;
}

/** Where work that outlives its request goes. See AppOptions in app.ts. */
export type Background = (task: Promise<void>) => void;

/** The one writing of the card the button sits on, or null if there is none. */
async function cardBeingRead(
  db: Db,
  target: NarrationTarget,
): Promise<{ id: string; content: CardContentT; writtenAt: Date } | null> {
  const row = await db.conceptCard.findUnique({
    where: {
      nodeId_depth_variant: {
        nodeId: target.node.id,
        depth: target.settings.depth,
        variant: cardVariant(target.settings),
      },
    },
  });
  // Parsed here rather than at the call site that reads it: `content` is a Json
  // column, which is the one thing Prisma cannot describe the shape of, so this
  // is the boundary where an unrecognised row has to fail loudly.
  return row === null
    ? null
    : { id: row.id, content: CardContent.parse(row.content), writtenAt: row.createdAt };
}

/**
 * Where this learner's recording of this card belongs in the bucket.
 *
 * Built rather than remembered, so it can be compared against the key a stored
 * row was written to: they differ exactly when NARRATION_PROMPT_REVISION has
 * moved or the topic has been put into another voice, which is how a rewritten
 * narration.md and a moved voice chip each retire every recording without a
 * migration and without deleting anything.
 */
function keyFor(target: NarrationTarget): string {
  return narrationKey({
    username: target.username,
    topicSlug: target.topic.slug,
    nodePath: target.node.path,
    voice: target.topic.narrationVoice,
    depth: target.settings.depth,
    variant: cardVariant(target.settings),
  });
}

/** The columns a stored recording has to say what it is and where it got to. */
interface NarrationRow {
  status: string;
  error: string;
  objectKey: string;
  cardWrittenAt: Date;
  seconds: number;
  voice: string;
  createdAt: Date;
}

/**
 * Whether a stored recording is still of the words on the card.
 *
 * Two ways it can stop being: the card was written again, which moves its
 * `createdAt` without changing its id; and NARRATION_PROMPT_REVISION moved,
 * which changes the key the recording would be written to now. Both are answered
 * as "there is no recording", because that is what they mean to the button.
 */
function isCurrent(row: NarrationRow, key: string, cardWrittenAt: Date): boolean {
  return row.objectKey === key && row.cardWrittenAt.getTime() === cardWrittenAt.getTime();
}

/**
 * Where a row has actually got to, which is not always what its column says.
 *
 * The run happens in this process, so a deploy or a crash mid-synthesis leaves a
 * row reading `pending` with nothing coming. Read as pending forever, that is a
 * spinner the learner watches until they give up; read as failed, it is a button
 * they can press again. Nothing writes the timeout down — the next claim
 * overwrites the row anyway, and a sweeper would be a second thing to keep
 * running for a case that resolves itself.
 */
function statusOf(row: NarrationRow, now: Date): NarrationStatus {
  const status = NarrationStatusSchema.parse(row.status);
  const abandoned = now.getTime() - row.createdAt.getTime() >= NARRATION_TIMEOUT_MS;
  return status === NarrationStatus.Pending && abandoned ? NarrationStatus.Failed : status;
}

/**
 * A stored row as the app sees it.
 *
 * The store is a factory rather than a store because only one of the three
 * states needs it: building it needs AUDIO_BUCKET, and a deployment without one
 * is supposed to serve every route and fail only the press.
 */
async function viewOf(
  objects: () => ObjectStore,
  row: NarrationRow,
  now: Date,
): Promise<NodeAudioT> {
  switch (statusOf(row, now)) {
    case NarrationStatus.Pending:
      return { status: NarrationStatus.Pending, startedAt: row.createdAt };
    case NarrationStatus.Failed:
      // A row that ran out of time never got to write its own reason.
      return {
        status: NarrationStatus.Failed,
        error: row.error === "" ? NARRATION_TIMED_OUT : row.error,
      };
    case NarrationStatus.Ready:
      return {
        status: NarrationStatus.Ready,
        url: await objects().signedUrl(row.objectKey, AUDIO_URL_TTL_SECONDS),
        expiresAt: new Date(now.getTime() + AUDIO_URL_TTL_SECONDS * 1000),
        seconds: row.seconds,
        voice: row.voice,
        // What identifies this recording to a player that has already loaded one.
        madeAt: row.createdAt,
      };
  }
}

/**
 * Where the card on screen has got to, if anywhere. Two queries and — only for a
 * recording there is something to play — one signature. It never reaches a
 * model and never writes.
 *
 * Null is every kind of "nothing has been asked for": no card, no row, or a row
 * about a card that has since been written again. They all mean the same thing
 * to the button, which is that pressing it starts one.
 */
export async function readNarration(
  db: Db,
  objects: () => ObjectStore,
  target: NarrationTarget,
): Promise<NodeAudioT | null> {
  const card = await cardBeingRead(db, target);
  if (card === null) {
    return null;
  }
  const row = await db.cardNarration.findUnique({ where: { cardId: card.id } });
  if (row === null) {
    return null;
  }
  const now = new Date();
  // A run under way is reported whatever writing of the card it was claimed
  // for, because that is what is true: the machine is busy on this card and a
  // second run cannot start until it is done. Answering null there — while the
  // press answers `pending`, since it cannot take the run over either — is what
  // made the button flicker between a spinner and an offer and do nothing at
  // all for as long as the run lasted.
  if (statusOf(row, now) !== NarrationStatus.Pending && !isCurrent(row, keyFor(target), card.writtenAt)) {
    return null;
  }
  return viewOf(objects, row, now);
}

/**
 * Take the run, or find that somebody else has it.
 *
 * Two presses a moment apart must not both pay for the same card, and the
 * read-then-write this replaced could not promise that. The insert is
 * `skipDuplicates`, so exactly one of two concurrent presses creates the row;
 * the update names the states it is allowed to take over from, so exactly one
 * takes over an existing row. Either way the loser is told to look at what is
 * there rather than starting a second run.
 */
async function claimRun(
  db: Db,
  cardId: string,
  row: {
    objectKey: string;
    cardWrittenAt: Date;
    createdAt: Date;
    /**
     * The topic's voice at the moment of the claim, written down rather than
     * looked up later: the topic can be moved to another voice while this run
     * is under way, and the row has to say which one actually spoke.
     */
    voice: NarrationVoice;
  },
): Promise<boolean> {
  const claimed = {
    status: NarrationStatus.Pending,
    error: "",
    script: "",
    seconds: 0,
    bytes: 0,
    ...row,
  };
  const created = await db.cardNarration.createMany({
    data: [{ id: newId(), cardId, ...claimed, attempts: 1 }],
    skipDuplicates: true,
  });
  if (created.count === 1) {
    return true;
  }
  // Something is already there: a finished recording of other text, a failure,
  // or a run whose process went away. Never a run still under way — the caller
  // has already answered with that one.
  //
  // `lte`, not `lt`, because statusOf calls a run abandoned at exactly the
  // timeout. Two guards on the same predicate written with different
  // comparators is a press that reports a failure and starts nothing.
  const abandoned = new Date(row.createdAt.getTime() - NARRATION_TIMEOUT_MS);
  const taken = await db.cardNarration.updateMany({
    where: {
      cardId,
      OR: [{ status: { not: NarrationStatus.Pending } }, { createdAt: { lte: abandoned } }],
    },
    // Counted rather than replaced, because the row is the budget's only record
    // of this card: one row per card means a card that fails every time would
    // otherwise be retryable without limit, and each retry is two model calls.
    data: { ...claimed, attempts: { increment: 1 } },
  });
  return taken.count === 1;
}

/**
 * Write the script, say it, and put it in the bucket — behind the response that
 * started it.
 *
 * Every failure lands on the row rather than on a request nobody is holding any
 * more, because the row is the only thing the learner can still see. The message
 * is the model's own where there is one, the same rule a failed map build
 * follows: those are written to be read by a person.
 */
async function runNarration(
  db: Db,
  provider: LlmProvider,
  speech: SpeechProvider,
  store: ObjectStore,
  target: NarrationTarget,
  card: { id: string; content: CardContentT },
  key: string,
  /**
   * When this run claimed the row, which is what it owns.
   *
   * A run declared abandoned is taken over, and the process running it may
   * still be alive — a slow speech model finishing at minute eleven. Without a
   * token its `update` would land on the row belonging to the run that replaced
   * it: marking a live run failed, or marking it ready with the wrong script.
   * Every write this function makes names the claim it is for, so a run that
   * has lost the row writes nothing at all.
   */
  claimedAt: Date,
): Promise<void> {
  const stillOurs = async (): Promise<boolean> => {
    const row = await db.cardNarration.findUnique({ where: { cardId: card.id } });
    return row !== null && row.createdAt.getTime() === claimedAt.getTime();
  };
  try {
    const { script } = await generateNarration(provider, {
      topic: target.topic,
      node: target.node,
      card: card.content,
      settings: target.settings,
    });
    const spoken = await speech.speak({ text: script, voice: target.topic.narrationVoice });
    const rate = sampleRateOf(spoken.mimeType);
    const wav = pcmToWav(spoken.audio, rate);

    // The object first, the row second. The other order marks a recording ready
    // while it points at nothing, which the player meets as a broken link; this
    // order can leave an object no row names, which nobody meets at all and the
    // next run overwrites — the key is the card's identity, so a re-recording
    // lands on top of what it replaces rather than beside it.
    // Checked before the object as well as with the row, because the object is
    // the one thing here that is not conditional: two runs write the same key,
    // so a run that has already lost the row must not put its bytes under the
    // recording that replaced it.
    if (!(await stillOurs())) {
      return;
    }
    await store.put(key, wav, AUDIO_CONTENT_TYPE);
    await db.cardNarration.updateMany({
      where: { cardId: card.id, createdAt: claimedAt },
      data: {
        status: NarrationStatus.Ready,
        error: "",
        script,
        seconds: pcmSeconds(spoken.audio.length, rate),
        bytes: wav.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reading this card out failed.";
    await db.cardNarration
      .updateMany({
        where: { cardId: card.id, createdAt: claimedAt },
        data: { status: NarrationStatus.Failed, error: message.slice(0, NARRATION_ERROR_MAX) },
      })
      // The row can be gone: deleting the node, or rebuilding the map, takes it
      // with the card while the run is still going. Nothing to record it on.
      .catch(() => undefined);
  }
}

/**
 * Start reading this card out, and answer with where it has got to.
 *
 * The press is not the recording. Making one is two model calls and minutes of
 * synthesis, and the edge gives an origin sixty seconds — so this claims the
 * run, hands it to `background`, and answers immediately. The app polls the read
 * above until the row settles.
 *
 * Nothing here is paid for twice. A recording already made is answered from the
 * bucket, a run already under way is answered as itself, and the budget is
 * checked only once past both — so a press that would have cost nothing is never
 * the one refused.
 */
export async function startNarration(
  db: Db,
  provider: LlmProvider,
  speech: SpeechProvider,
  objects: () => ObjectStore,
  background: Background,
  target: NarrationTarget,
): Promise<NodeAudioT> {
  const card = await cardBeingRead(db, target);
  if (card === null) {
    // Never generates one: the button lives on a card, so a node with none at
    // these settings is a node this request has no business writing.
    throw new ConflictError("Open this card first — there is nothing to read out yet.");
  }
  const key = keyFor(target);
  // Before the claim, so a deployment with no bucket still fails the press at
  // once and names the variable, rather than answering "working on it" and
  // failing out of sight a moment later.
  const store = objects();
  const now = new Date();

  const existing = await db.cardNarration.findUnique({ where: { cardId: card.id } });
  if (existing !== null) {
    const status = statusOf(existing, now);
    // A run under way is answered as itself whatever it was claimed for — see
    // readNarration. Waiting for it is not a wasted wait even when its result
    // will not be served: nothing else can claim the row until it is done, and
    // the press after it can.
    const busy = status === NarrationStatus.Pending;
    const made = status === NarrationStatus.Ready && isCurrent(existing, key, card.writtenAt);
    if (busy || made) {
      return viewOf(objects, existing, now);
    }
  }
  await assertNarrationBudget(db, target.userId);

  const claimed = await claimRun(db, card.id, {
    objectKey: key,
    cardWrittenAt: card.writtenAt,
    createdAt: now,
    voice: target.topic.narrationVoice,
  });
  if (!claimed) {
    // Another press got there between the read above and here. Whatever it
    // claimed is what this one is waiting for too.
    const current = await db.cardNarration.findUnique({ where: { cardId: card.id } });
    return current === null
      ? { status: NarrationStatus.Failed, error: "That recording could not be started." }
      : viewOf(objects, current, now);
  }

  background(runNarration(db, provider, speech, store, target, card, key, now));
  return { status: NarrationStatus.Pending, startedAt: now };
}
