import { describe, expect, it } from "vitest";
import {
  CARD_MINUTES_MAX,
  NARRATION_PROMPT_REVISION,
  NARRATION_SCRIPT_MAX,
  NarrationScript,
  NarrationVoice,
  SPOKEN_WORDS_PER_MINUTE,
  cardVariant,
  narrationKey,
  narrationWords,
} from "../src";
import { CardAngle } from "../src/cards";
import { ContentFormat, EnglishLevel, ParagraphLength, TechnicalDetail } from "../src/topics";

const settings = {
  depth: 2,
  minutes: 3,
  englishLevel: EnglishLevel.Medium,
  technicalDetail: TechnicalDetail.Medium,
  format: ContentFormat.Prose,
  paragraphLength: ParagraphLength.Medium,
  angle: CardAngle.Base,
  instructions: "",
};

describe("narrationKey", () => {
  it("lays the bucket out by the slugs the URLs are laid out by", () => {
    const key = narrationKey({
      username: "robin",
      topicSlug: "kubernetes",
      nodePath: "scheduling/taints",
      voice: NarrationVoice.Erinome,
      depth: settings.depth,
      variant: cardVariant(settings),
    });
    expect(key.startsWith("robin/kubernetes/scheduling/taints/")).toBe(true);
    expect(key.endsWith(".wav")).toBe(true);
  });

  it("gives two accounts two folders, whatever the topic is called", () => {
    const shared = {
      topicSlug: "kubernetes",
      nodePath: "pods",
      voice: NarrationVoice.Erinome,
      depth: 2,
      variant: "v",
    };
    expect(narrationKey({ ...shared, username: "robin" })).not.toBe(
      narrationKey({ ...shared, username: "robin-2" }),
    );
  });

  it("names the card in the file, so two settings never share one recording", () => {
    const shared = {
      username: "robin",
      topicSlug: "kubernetes",
      nodePath: "pods",
      voice: NarrationVoice.Erinome,
    };
    const base = narrationKey({ ...shared, depth: 2, variant: cardVariant(settings) });
    // The depth is its own column on the card, so it is its own piece of the name.
    expect(narrationKey({ ...shared, depth: 4, variant: cardVariant(settings) })).not.toBe(base);
    // And everything else the card was written to travels in the variant.
    expect(
      narrationKey({
        ...shared,
        depth: 2,
        variant: cardVariant({ ...settings, englishLevel: EnglishLevel.Simple }),
      }),
    ).not.toBe(base);
  });

  it("is stable for the same card, so a recording overwrites its own object", () => {
    const input = {
      username: "robin",
      topicSlug: "k8s",
      nodePath: "pods",
      voice: NarrationVoice.Erinome,
      depth: 2,
      variant: "v",
    };
    expect(narrationKey(input)).toBe(narrationKey(input));
  });

  it("carries the narration revision, which is what retires every recording", () => {
    const key = narrationKey({
      username: "robin",
      topicSlug: "k8s",
      nodePath: "pods",
      voice: NarrationVoice.Erinome,
      depth: 2,
      variant: cardVariant(settings),
    });
    expect(key).toContain(`/n${NARRATION_PROMPT_REVISION}-erinome-d2-`);
  });

  it("carries the voice, which is what retires the recordings of one topic", () => {
    // The whole of how a moved voice chip takes effect: a stored row is served
    // only while its key still matches the one built here, so the recordings a
    // topic already has stop matching and the next press records them again.
    const shared = {
      username: "robin",
      topicSlug: "k8s",
      nodePath: "pods",
      depth: 2,
      variant: cardVariant(settings),
    };
    expect(narrationKey({ ...shared, voice: NarrationVoice.Erinome })).not.toBe(
      narrationKey({ ...shared, voice: NarrationVoice.Kore }),
    );
  });

  it("writes a key with nothing in it that needs escaping", () => {
    const key = narrationKey({
      username: "robin",
      topicSlug: "k8s",
      nodePath: "scheduling/taints",
      // The longest name in the set: nothing in it needs escaping either.
      voice: NarrationVoice.Vindemiatrix,
      depth: 5,
      variant: cardVariant({ ...settings, angle: CardAngle.MoreConcrete, format: ContentFormat.ReferenceNotes }),
    });
    // The variant's own separator is a pipe, which is legal in a key and
    // unreadable in one; everything left is a slug, a digit or a hyphen.
    expect(key).not.toContain("|");
    expect(/^[a-z0-9/_.-]+$/.test(key)).toBe(true);
  });
});

describe("narrationWords", () => {
  it("asks for as many minutes of speech as the card asks for of reading", () => {
    expect(narrationWords(3)).toBe(3 * SPOKEN_WORDS_PER_MINUTE);
  });

  it("leaves room in the schema for the longest card it can be asked for", () => {
    // The cap is the outer bound of the longest card, not the size of an
    // ordinary one — the same relationship CardContent has to the read time. A
    // script the prompt asks for must never be one the schema refuses.
    const longest = "word ".repeat(narrationWords(CARD_MINUTES_MAX));
    expect(longest.length).toBeLessThanOrEqual(NARRATION_SCRIPT_MAX);
    expect(NarrationScript.safeParse({ script: longest }).success).toBe(true);
  });

  it("refuses a reply with nothing in it to say", () => {
    expect(NarrationScript.safeParse({ script: "" }).success).toBe(false);
  });
});
