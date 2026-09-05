import "dotenv/config";
import { z } from "zod";
import { LlmProviderId, LlmProviderIdSchema, LlmTask } from "@interestled/schemas";

/**
 * An unset repository variable still reaches the box as a line.
 *
 * The deploy workflow writes /etc/interestled-api.env from `vars.X`, and an
 * unset variable interpolates to nothing — so the file gets `LLM_MODEL=` rather
 * than no line at all. Zod fills a default for `undefined` and not for `""`, so
 * without this an unset variable fails `min(1)` and the parse throws on the
 * first request, which takes down registration, login and the map screen alike
 * for what is supposed to be an optional setting.
 */
function unsetWhenEmpty<T extends z.ZodTypeAny>(schema: T): z.ZodEffects<T, T["_output"], unknown> {
  return z.preprocess((value) => (value === "" ? undefined : value), schema);
}

/**
 * Provider keys are all optional here and checked when the provider is actually
 * built, so running with LLM_PROVIDER=gemini does not require an OpenAI key.
 */
export const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PORT: unsetWhenEmpty(z.coerce.number().int().positive().default(7071)),
  LLM_PROVIDER: unsetWhenEmpty(LlmProviderIdSchema.default(LlmProviderId.Gemini)),
  /**
   * The model that builds maps: the whole map, the seven choices in front of it,
   * and one group rebuilt. Google retires these — gemini-2.0-flash returned 404
   * "no longer available" in August 2026 — so the default is only a default and
   * LLM_MODEL is set per deployment.
   *
   * gemini-3.1-pro-preview is Gemini 3.1 Pro, which is preview-only: there is no
   * stable gemini-3.1-pro on the Gemini API. It reasons before it answers and
   * cannot be told not to, which is why the map calls carry the output budget
   * they do — thinking is spent from the same allowance as the reply.
   */
  LLM_MODEL: unsetWhenEmpty(z.string().min(1).default("gemini-3.1-pro-preview")),
  /**
   * The model that writes everything inside a map. Separate because the two jobs
   * are priced differently and used at completely different rates: one map per
   * topic against a card, a drill and a verdict per node. Flash is roughly a
   * third of Pro per output token, and a card is a page of prose the learner can
   * already rewrite with the controls under it.
   *
   * gemini-3.7-flash is GA rather than preview, unlike the map model. Its price
   * is introductory and doubles on 31 December 2026, which is the date to have a
   * view on rather than a surprise — this is the model carrying the volume.
   *
   * Unset falls back to this default rather than to LLM_MODEL, so a deployment
   * that only names the map model still gets the cheap one for content.
   */
  LLM_CONTENT_MODEL: unsetWhenEmpty(z.string().min(1).default("gemini-3.7-flash")),
  /**
   * The model that reads a card out. Its own variable because the TTS models
   * are a separate line from the ones that write text — a name that works on
   * :generateContent for prose is not a name that answers with audio — and
   * because they are all preview-only, so this is the one most likely to need
   * moving. gemini-2.5-flash-preview-tts is the cheaper predecessor if it does.
   *
   * What it costs is worth knowing before turning it on: a card read aloud is
   * minutes of speech, billed per audio token, where the script in front of it
   * is a few hundred words of text. The synthesis is the expensive half.
   */
  LLM_AUDIO_MODEL: unsetWhenEmpty(z.string().min(1).default("gemini-3.1-flash-tts-preview")),
  GEMINI_API_KEY: unsetWhenEmpty(z.string().min(1).optional()),
  /**
   * Where recordings are kept. Optional, and unset is a deployment with the
   * feature off rather than a broken one: nothing else in the product touches
   * S3, so the play button is the only thing that fails, and it says so.
   */
  AUDIO_BUCKET: unsetWhenEmpty(z.string().min(1).optional()),
  AWS_REGION: unsetWhenEmpty(z.string().min(1).default("us-east-1")),
  /**
   * The API's own credentials, which are not the deployer's: the deployer can
   * write the web bucket and invalidate the distribution, and this user can put
   * and get objects in the audio bucket and nothing else. Read here rather than
   * left to the SDK's own environment lookup so a missing key fails with a
   * sentence naming it, the same as GEMINI_API_KEY above.
   */
  AWS_ACCESS_KEY_ID: unsetWhenEmpty(z.string().min(1).optional()),
  AWS_SECRET_ACCESS_KEY: unsetWhenEmpty(z.string().min(1).optional()),
  OPENAI_API_KEY: unsetWhenEmpty(z.string().min(1).optional()),
  ANTHROPIC_API_KEY: unsetWhenEmpty(z.string().min(1).optional()),
});

export type EnvT = z.infer<typeof EnvSchema>;

/**
 * The generation ceilings, and every one of them is off unless the deployment
 * names it.
 *
 * They used to be constants in topics.ts, which made "the model bill has a
 * ceiling" and "a learner can be told no" the same decision — and the second one
 * is the one that bites: a build cut off by CloudFront at 60s runs to
 * completion on the server, so a handful of retries after a timeout had spent
 * the hour's nodes and the next press was refused for a map the learner never
 * got. Unset is therefore no ceiling at all, and a deployment that wants one
 * sets the number.
 *
 * Every one is optional and none has a default: the value is a repository
 * variable, and an unset variable reaches the box as an empty line rather than
 * as no line (see unsetWhenEmpty above). A value that is not a whole number
 * fails the parse rather than being read as "off" — a ceiling somebody meant to
 * set and mistyped must not be a ceiling that silently is not there.
 */
export const LimitsSchema = z.object({
  MAX_TOPICS_PER_HOUR: unsetWhenEmpty(z.coerce.number().int().nonnegative().optional()),
  MAX_TOPICS_PER_USER: unsetWhenEmpty(z.coerce.number().int().nonnegative().optional()),
  MAX_GENERATED_NODES_PER_HOUR: unsetWhenEmpty(z.coerce.number().int().nonnegative().optional()),
  MAX_MAP_PLANS_PER_HOUR: unsetWhenEmpty(z.coerce.number().int().nonnegative().optional()),
  MAX_CARDS_WRITTEN_PER_HOUR: unsetWhenEmpty(z.coerce.number().int().nonnegative().optional()),
  MAX_QUESTIONS_PER_HOUR: unsetWhenEmpty(z.coerce.number().int().nonnegative().optional()),
  MAX_NARRATIONS_PER_HOUR: unsetWhenEmpty(z.coerce.number().int().nonnegative().optional()),
});

export type LimitsT = z.infer<typeof LimitsSchema>;

/**
 * Parsed on every call rather than memoised like getEnv below. It is seven
 * coercions in front of a check that is about to run a database count, and the
 * copy a lazy singleton would hold is one written before any test could set a
 * ceiling to prove it still refuses.
 */
export function getLimits(): LimitsT {
  return LimitsSchema.parse(process.env);
}

/**
 * The model each job runs on. One place, so a new task cannot silently pick one
 * — and a switch rather than a ternary, so adding a member to LlmTask fails the
 * build here rather than quietly running on the content model.
 */
export function modelFor(env: EnvT, task: LlmTask): string {
  switch (task) {
    case LlmTask.Map:
      return env.LLM_MODEL;
    case LlmTask.Content:
      return env.LLM_CONTENT_MODEL;
    case LlmTask.Speech:
      return env.LLM_AUDIO_MODEL;
  }
}

let parsed: EnvT | null = null;

/**
 * Parsed on first use rather than at import. Parsing at import time makes the
 * environment a load-order dependency: importing anything that transitively
 * reaches this file — createApp does, through the LLM registry — would throw
 * before a single line ran. Lazily, a missing variable fails the request that
 * needed it, which is what the Lambda entry point promises.
 */
export function getEnv(): EnvT {
  return (parsed ??= EnvSchema.parse(process.env));
}
