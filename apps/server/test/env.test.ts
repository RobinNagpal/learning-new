import { describe, expect, it } from "vitest";
import { LlmTask } from "@interestled/schemas";
import { EnvSchema, LimitsSchema, modelFor } from "../src/env";

/** Everything the schema requires, so a test only names what it is about. */
function env(overrides: Record<string, string> = {}): Record<string, string> {
  return { DATABASE_URL: "postgres://localhost/test", ...overrides };
}

describe("the environment", () => {
  it("reads an unset repository variable as unset, not as an empty model name", () => {
    // The deploy workflow writes LLM_MODEL=${{ vars.LLM_MODEL }}, and an unset
    // variable interpolates to nothing — so the file gets "LLM_MODEL=" rather
    // than no line. Zod fills a default for undefined and not for "", so without
    // the preprocess this throws on the first request and takes the whole API
    // down for what is supposed to be an optional setting.
    const parsed = EnvSchema.safeParse(
      env({
        LLM_MODEL: "",
        LLM_CONTENT_MODEL: "",
        LLM_AUDIO_MODEL: "",
        LLM_PROVIDER: "",
        PORT: "",
        GEMINI_API_KEY: "",
        AUDIO_BUCKET: "",
        AWS_REGION: "",
        AWS_ACCESS_KEY_ID: "",
        AWS_SECRET_ACCESS_KEY: "",
      }),
    );
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.LLM_MODEL).toBe("gemini-3.1-pro-preview");
    expect(parsed.success && parsed.data.GEMINI_API_KEY).toBeUndefined();
    // The audio half is optional all the way down: a deployment that has set
    // none of it has the play button off, not an API that will not start.
    expect(parsed.success && parsed.data.AUDIO_BUCKET).toBeUndefined();
    expect(parsed.success && parsed.data.AWS_ACCESS_KEY_ID).toBeUndefined();
    expect(parsed.success && parsed.data.AWS_REGION).toBe("us-east-1");
  });

  it("still refuses a database url, which has no default to fall back to", () => {
    expect(EnvSchema.safeParse({ DATABASE_URL: "" }).success).toBe(false);
  });

  it("keeps a variable that is actually set", () => {
    const parsed = EnvSchema.parse(env({ LLM_MODEL: "gemini-9-pro", PORT: "8080" }));
    expect(parsed.LLM_MODEL).toBe("gemini-9-pro");
    expect(parsed.PORT).toBe(8080);
  });
});

describe("the generation ceilings", () => {
  it("reads nothing set, and an empty line, as no ceiling at all", () => {
    // Unset is the default the product ships with: a build cut off by
    // CloudFront at 60s still spends the hour's nodes, and being refused the
    // retry for a map that never arrived is worse than the bill it guards.
    const parsed = LimitsSchema.parse({ MAX_TOPICS_PER_HOUR: "" });
    expect(parsed.MAX_TOPICS_PER_HOUR).toBeUndefined();
    expect(parsed.MAX_GENERATED_NODES_PER_HOUR).toBeUndefined();
  });

  it("keeps a ceiling that is set, zero included", () => {
    const parsed = LimitsSchema.parse({
      MAX_GENERATED_NODES_PER_HOUR: "400",
      MAX_NARRATIONS_PER_HOUR: "0",
    });
    expect(parsed.MAX_GENERATED_NODES_PER_HOUR).toBe(400);
    // Zero is a deployment with that generation turned off, not one with no
    // ceiling — which is why unset is undefined rather than 0.
    expect(parsed.MAX_NARRATIONS_PER_HOUR).toBe(0);
  });

  it("refuses a ceiling that is not a whole number rather than reading it as off", () => {
    // A ceiling somebody meant to set and mistyped must not be a ceiling that
    // silently is not there.
    expect(LimitsSchema.safeParse({ MAX_TOPICS_PER_HOUR: "ten" }).success).toBe(false);
    expect(LimitsSchema.safeParse({ MAX_TOPICS_PER_HOUR: "-1" }).success).toBe(false);
  });
});

describe("modelFor", () => {
  it("sends a map to the reasoning model and a card to the fast one", () => {
    const parsed = EnvSchema.parse(
      env({ LLM_MODEL: "gemini-3.1-pro-preview", LLM_CONTENT_MODEL: "gemini-3.7-flash" }),
    );
    expect(modelFor(parsed, LlmTask.Map)).toBe("gemini-3.1-pro-preview");
    expect(modelFor(parsed, LlmTask.Content)).toBe("gemini-3.7-flash");
  });

  it("sends speech to its own model, which is not a model that writes text", () => {
    // A TTS name does not answer :generateContent with prose and a text name
    // does not answer with audio, so a fallback between them is not a fallback
    // — it is a call that fails at runtime with a confusing message.
    const parsed = EnvSchema.parse(env({ LLM_AUDIO_MODEL: "gemini-3.1-flash-tts-preview" }));
    expect(modelFor(parsed, LlmTask.Speech)).toBe("gemini-3.1-flash-tts-preview");
    expect(modelFor(parsed, LlmTask.Speech)).not.toBe(modelFor(parsed, LlmTask.Content));
  });

  it("falls back to its own default for content rather than to the map's model", () => {
    // Otherwise naming only the map model quietly puts every card on the
    // expensive one, which is the whole thing this split exists to avoid.
    const parsed = EnvSchema.parse(env({ LLM_MODEL: "gemini-3.1-pro-preview" }));
    expect(modelFor(parsed, LlmTask.Content)).toBe("gemini-3.7-flash");
    expect(modelFor(parsed, LlmTask.Content)).not.toBe(parsed.LLM_MODEL);
  });
});
