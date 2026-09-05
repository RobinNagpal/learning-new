import { z } from "zod";
import { CARD_MINUTES_MAX, CardMinutes } from "./cards";
import type { NarrationVoice } from "./voices";

/**
 * Which generation of the narration prompt made a stored recording.
 *
 * The same device CARD_PROMPT_REVISION is: audio is expensive to make and kept
 * forever, so a rewritten narration.md would otherwise reach nobody who had
 * already pressed play. The revision is part of the object key, and the row
 * stores the key it was written to — so a bump makes every stored recording
 * miss its own lookup and the next press writes a new one, with no migration
 * and nothing to delete.
 *
 * Bump it when a change to narration.md changes how an existing card should
 * sound.
 */
export const NARRATION_PROMPT_REVISION = 1;

/**
 * Speech is slower than reading. 200 words a minute is ordinary adult prose off
 * a page (WORDS_PER_MINUTE); said aloud at a pace somebody can follow while
 * doing something else, the same words take half again as long.
 *
 * It is what turns a card's read time into a spoken length, and it is why the
 * narration is not simply the card read out: a three-minute card read aloud is
 * four and a half minutes, and the parts that carry the least — the notation,
 * the code, the exact figures — are the parts that cost the most to say.
 */
export const SPOKEN_WORDS_PER_MINUTE = 150;

/** How long the narration of a card of this length should run, in words. */
export function narrationWords(minutes: number): number {
  return CardMinutes.parse(minutes) * SPOKEN_WORDS_PER_MINUTE;
}

/**
 * The outer bound on a script, as characters. Derived from the longest card the
 * product writes rather than chosen, so a length the prompt asks for can never
 * be one the schema refuses — the same relationship MAX_MECHANISM_SECTIONS has
 * to the card prompt. Six characters a word is English including its spaces,
 * and the quarter of slack is the range the prompt is allowed to land in.
 */
const CHARACTERS_PER_WORD = 6;

export const NARRATION_SCRIPT_MAX = Math.ceil(
  CARD_MINUTES_MAX * SPOKEN_WORDS_PER_MINUTE * CHARACTERS_PER_WORD * 1.25,
);

/**
 * What the model writes: the words to be spoken, and nothing else.
 *
 * One string rather than a slot per section of the card, because it is read
 * end to end in one pass and the joins between the sections are the part that
 * has to be written rather than assembled — a recording assembled from six
 * separately-written slots is six openings.
 */
export const NarrationScript = z.object({
  script: z.string().min(1).max(NARRATION_SCRIPT_MAX),
});

export type NarrationScriptT = z.infer<typeof NarrationScript>;

/**
 * Where a recording lives in the audio bucket.
 *
 * Readable rather than hashed, and built from the slugs the URLs are already
 * built from: `robin/kubernetes/scheduling/taints/n1-erinome-d2-r6-base-3-….wav`
 * says whose it is, which topic, where on the map, and who read it — so the
 * bucket can be read by a person looking for one file. The learner's slug is
 * the top folder because a node belongs to exactly one topic, which belongs to
 * exactly one account — nothing is shared, so nothing collides across accounts.
 *
 * The file name is the recording's identity: the narration revision, the voice,
 * the depth, and the card variant, which between them are everything that
 * decides what was said and how it sounded. So a card re-recorded in the same
 * voice at the same settings overwrites its own object rather than leaving one
 * behind, and any of the four changing gets its own.
 *
 * The voice is in the key rather than only on the row because that is what
 * makes changing it take effect. A stored row is served only while its key
 * still matches the one built here, so a topic moved to another voice misses
 * every recording it already has and the next press records again — the same
 * device NARRATION_PROMPT_REVISION is, with no migration and nothing deleted.
 * Lower-cased on the way in, because the rest of the key is slugs.
 *
 * The variant's separator is swapped for a hyphen because the pieces inside it
 * already use underscores, and a key is easier to read when the two levels are
 * told apart.
 */
export function narrationKey(input: {
  username: string;
  topicSlug: string;
  nodePath: string;
  /** The topic's narration voice — what said it, and so part of what it is. */
  voice: NarrationVoice;
  depth: number;
  /** cardVariant(settings) — what the card the recording is of was written to. */
  variant: string;
}): string {
  const file = [
    `n${NARRATION_PROMPT_REVISION}`,
    input.voice.toLowerCase(),
    `d${input.depth}`,
    input.variant.split("|").join("-"),
  ].join("-");
  return `${input.username}/${input.topicSlug}/${input.nodePath}/${file}.wav`;
}

/**
 * Where a recording has got to.
 *
 * Making one is two model calls and minutes of synthesis, which is far too long
 * to hold a request open — CloudFront gives an origin 60 seconds. So the press
 * starts the work and answers, the row carries the state, and the app asks again
 * until it settles. A TS enum with a plain TEXT column behind it, like every
 * other status in the product.
 */
export enum NarrationStatus {
  /** Claimed, and being made. Nothing to play yet. */
  Pending = "pending",
  /** There is an object in the bucket and it is of the words on the card. */
  Ready = "ready",
  /** It stopped, and `error` says what the learner should be told. */
  Failed = "failed",
}

export const NarrationStatusSchema = z.nativeEnum(NarrationStatus);

/**
 * The most of a failure's message that is kept and shown. Long enough for a
 * provider's own sentence, short enough that a stack trace leaking into one
 * cannot fill the screen under the button.
 */
export const NARRATION_ERROR_MAX = 500;

/**
 * How long a claimed recording may go without finishing before it is read as a
 * failure.
 *
 * The work runs in the API process, so a deploy or a crash mid-synthesis leaves
 * a row that says `pending` with nothing coming. Without this the app polls that
 * row until the learner gives up. Generously above the slowest real generation —
 * a ten-minute card is a script plus minutes of speech — because cutting a run
 * short costs the model call that was already paid for.
 */
export const NARRATION_TIMEOUT_MS = 10 * 60 * 1000;

/** What a learner is told about a run whose process went away mid-generation. */
export const NARRATION_TIMED_OUT =
  "That recording stopped before it finished. Press play to try again.";

/**
 * What the app is given: somewhere to play from, and how long it runs.
 *
 * The URL is signed and short-lived rather than public, because a recording is
 * one learner's card read aloud — the bucket blocks public access, and the
 * expiry is why every read of this route mints a new one instead of the app
 * keeping the last.
 */
export const NodeAudioReady = z.object({
  status: z.literal(NarrationStatus.Ready),
  url: z.string().min(1),
  expiresAt: z.coerce.date(),
  seconds: z.number().int().min(0),
  voice: z.string().min(1).max(64),
  /**
   * When this recording was started, which is what identifies it.
   *
   * Neither the URL nor the object key can do that job: the URL is signed fresh
   * on every read, and the key is stable across a re-recording on purpose, so
   * the object overwrites its own. This moves every time the words change — so
   * a player holding a loaded file can tell whether it is still the recording
   * the server has, or one of a card that has since been written again.
   */
  madeAt: z.coerce.date(),
});

const NodeAudioPending = z.object({
  status: z.literal(NarrationStatus.Pending),
  /** When the press that started it landed, so the screen can say it is working. */
  startedAt: z.coerce.date(),
});

const NodeAudioFailed = z.object({
  status: z.literal(NarrationStatus.Failed),
  /** Written to be shown to the learner, the same way a failed map build is. */
  error: z.string().min(1).max(NARRATION_ERROR_MAX),
});

/**
 * The three states, as a union rather than one object with optional fields.
 *
 * It is what stops a player reading a URL off a failure: there is no `url` on
 * the pending or failed member to read, so the mistake is a build error rather
 * than a request for `undefined.wav`.
 */
export const NodeAudio = z.discriminatedUnion("status", [
  NodeAudioPending,
  NodeAudioReady,
  NodeAudioFailed,
]);

/** Null before anything has been asked for on the card on screen. */
export const NodeAudioView = z.object({ audio: NodeAudio.nullable() });

/**
 * What the press answers with. Not nullable, unlike the view above: the press
 * either starts a recording, finds one already running, or finds one already
 * made — so a schema allowing null would make every call site handle a case the
 * route cannot produce.
 */
export const NodeAudioResult = z.object({ audio: NodeAudio });

export type NodeAudioT = z.infer<typeof NodeAudio>;
export type NodeAudioReadyT = z.infer<typeof NodeAudioReady>;
export type NodeAudioViewT = z.infer<typeof NodeAudioView>;
export type NodeAudioResultT = z.infer<typeof NodeAudioResult>;
