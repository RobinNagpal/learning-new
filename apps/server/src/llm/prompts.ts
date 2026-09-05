import {
  CardAngle,
  ContentFormat,
  DrillKind,
  EnglishLevel,
  LearningStyle,
  MAX_MECHANISM_SECTIONS,
  MAX_NODE_MINUTES,
  MECHANISM_SECTION_WORDS,
  MECHANISM_SHARE,
  MapDepth,
  MapLevels,
  SUB_HEADINGS_MAX,
  SUB_HEADINGS_MIN,
  SubtreeShape,
  narrationWords,
  PARAGRAPH_SENTENCES,
  mapShapeOf,
  totalMinutes,
  TechnicalDetail,
  WORDS_PER_MINUTE,
  contentSettingsOf,
} from "@interestled/schemas";
import type {
  AnsweredQuestionT,
  ParagraphLength,
  MapShapeT,
  CardContentT,
  CardQuestionT,
  CardSettingsT,
  LearningNodeT,
  MapQuestionOptionT,
  ProfileT,
  TopicContentSettingsT,
  TopicT,
} from "@interestled/schemas";
import { cardMinutes } from "@interestled/domain";
import { mapOutline, neighbourClaims } from "./outline";
import { promptFile } from "./promptFiles";
import { render } from "./template";

/**
 * The prompts themselves live in ./prompts as Markdown, one file per prompt,
 * filled here. Keeping the text out of TypeScript is what makes it readable as
 * the instructions it is — a template literal with three levels of interpolation
 * in it is a program that happens to contain English.
 *
 * What stays in code is the choosing: which block applies, and to what. A
 * template language that could express those conditions would be a second,
 * untyped program, and the enums below are exactly the thing the type system is
 * meant to keep exhaustive.
 */

/** Rules that hold for every generation. */
export const SYSTEM = promptFile("system");

/**
 * What each style actually changes about the writing. The enum values would mean
 * nothing to a model on their own, and "adapt to their learning style" is the
 * kind of instruction that changes nothing at all.
 */
const STYLE_GUIDE: Record<LearningStyle, string> = {
  [LearningStyle.Examples]: "Open with a worked example and derive the rule from it.",
  [LearningStyle.Analogies]: "Anchor each idea to one analogy from something they already know.",
  [LearningStyle.Visuals]: "Describe the structure spatially — what sits where, and what moves.",
  [LearningStyle.HandsOn]: "Make it something they run, type or change, not something they read.",
  [LearningStyle.StepByStep]: "Order it as a sequence, each step finishing before the next starts.",
  [LearningStyle.BigPicture]: "State how the whole thing fits together before any part of it.",
  [LearningStyle.Stories]: "Carry it on a concrete case with people and consequences in it.",
  [LearningStyle.Numbers]: "Use real quantities, and say what each one is measured against.",
};

/**
 * The profile, as prompt text. It is the same block for every generation call,
 * so the map and the cards under it are calibrated to one learner rather than
 * drifting apart. Every field is optional, so each line is omitted when empty
 * rather than sending "age: not stated" and inviting the model to comment on it.
 */
export function learnerBlock(profile: ProfileT): string {
  const styles = profile.learningStyles.map((style) => `- ${STYLE_GUIDE[style]}`).join("\n");
  const known =
    profile.age !== null || profile.background !== "" || profile.learningStyles.length > 0;
  return render(promptFile("learner"), {
    anything: known ? "yes" : "",
    age: profile.age === null ? "" : String(profile.age),
    background: profile.background,
    styles,
  });
}

function instructionBlock(instructions: string): string {
  return render(promptFile("instructions"), { instructions });
}

/**
 * What each answer actually changes about the writing. Same reason the learning
 * styles have a guide: "write it in the short_and_crisp style" was an
 * instruction that changed nothing at all.
 *
 * None of these names a depth or a length. Depth decides how far down the
 * mechanism the explanation goes and averageReadTime decides how long it runs;
 * these decide the words it is written in.
 */
const ENGLISH_GUIDE: Record<EnglishLevel, string> = {
  [EnglishLevel.Simple]:
    "everyday words and short sentences, assuming nothing about their vocabulary. Where a plain word will do, it is the one to use.",
  [EnglishLevel.Medium]: "ordinary adult prose — neither simplified nor dense.",
  [EnglishLevel.Advanced]:
    "dense and precise, with the language taken as read. No sentence spent making a point easier to read than it is to think about.",
};

/**
 * Independent of the English above, and content-rules.md says so outright: two
 * rules that pull opposite ways are two rules a model resolves by picking one.
 */
const TECHNICAL_GUIDE: Record<TechnicalDetail, string> = {
  [TechnicalDetail.Low]:
    "the idea in the learner's own terms. Reach for the field's vocabulary only where nothing else will do, and gloss it on the spot.",
  [TechnicalDetail.Medium]:
    "the terms that carry weight, each glossed where it first appears. The real name for a thing, never a paraphrase standing in for it.",
  [TechnicalDetail.High]:
    "the field's own terms, notation and real values throughout, used precisely. They want the real thing rather than a simplification.",
};

/** Empty for prose: a line reading "written as prose" is one more thing to answer. */
const FORMAT_GUIDE: Record<ContentFormat, string> = {
  [ContentFormat.Prose]: "",
  [ContentFormat.ReferenceNotes]:
    "something to look up rather than read through — the rule, the exact conditions it holds under, and the real values, each stated flat on its own. No linking sentences between them.",
};

/**
 * What a topic is written to before the learner has written anything of their
 * own, seeded from the settings they did choose.
 *
 * Seeded rather than fixed, because the instruction the settings can state
 * exactly — "each paragraph is 4-5 sentences long" — is worth more to a model
 * than the enum value behind it, and worth more to the learner as a sentence
 * they can edit than as a chip they cannot argue with.
 */
export function seedContentInstructions(paragraphLength: ParagraphLength): string {
  return render(promptFile("content-instructions"), {
    sentences: PARAGRAPH_SENTENCES[paragraphLength],
  });
}

/**
 * What a prompt is allowed to know about a topic's settings: how it is written,
 * and nothing about how it is read aloud.
 *
 * TopicContentSettings carries the narration voice as well, and no prompt may
 * see it — a card is written the same way whoever says it out loud, and the
 * three callers below assemble one of these out of a *card's* own settings,
 * which have no voice on them to put there. Stated as what is missing rather
 * than as a second list, so a setting added to the topic is one this block gets
 * unless somebody says otherwise.
 */
type WritingSettings = Omit<TopicContentSettingsT, "narrationVoice">;

/** The stored value, or the seed when the learner has not overridden it. */
export function effectiveContentInstructions(content: WritingSettings): string {
  return content.contentInstructions.trim() === ""
    ? seedContentInstructions(content.paragraphLength)
    : content.contentInstructions.trim();
}

/** What each depth means, as the line the instruction seed states. */
const MAP_DEPTH_GUIDE: Record<MapDepth, string> = {
  [MapDepth.Orientation]: "what it is, and when you would reach for it",
  [MapDepth.Working]: "enough to use it for the everyday cases",
  [MapDepth.Mechanism]: "the mechanism underneath, in the field's own terms",
  [MapDepth.Internals]: "the layer below that — internals, protocols, the maths",
  [MapDepth.Expert]: "edge cases, failure modes, and where the standard account is wrong",
};

/** The prompts are read as English, so "1 days" is a mistake the model can see. */
function daysText(days: number): string {
  return `${days} days`;
}

/**
 * The map instruction lines, seeded from the shape settings.
 *
 * This is the text the learner is shown before the map is built and can edit
 * before pressing the button. It is what makes the settings legible: "5 main
 * headings, 4 sub-headings under each" is a sentence somebody can disagree with,
 * where two number chips are a thing they have to imagine the effect of.
 */
export function seedMapInstructions(shape: MapShapeT): string {
  return render(promptFile("map-instructions"), {
    mainHeadings: String(shape.mainHeadings),
    subHeadings: String(shape.subHeadings),
    // Which line the counts are stated in: at three levels the sub-headings are
    // headings too, and the nodes hang under those. Saying it in one line rather
    // than adding a second, because the learner is going to read this as a
    // sentence about their map and then edit it.
    threeLevels: shape.levels === MapLevels.Three ? "yes" : "",
    totalTime: minutesText(totalMinutes(shape)),
    perDay: minutesText(shape.minutesPerDay),
    days: daysText(shape.days),
    // One day is one sitting, and "20 minutes a day for 1 days" is two ways of
    // saying the same number with a grammatical error between them.
    manyDays: shape.days === 1 ? "" : "yes",
    depth: MAP_DEPTH_GUIDE[shape.depth] ?? MAP_DEPTH_GUIDE[MapDepth.Working],
  });
}

/**
 * The lines a topic or a request actually means: the text when the learner has
 * written some, the seed of its own settings when they have not.
 *
 * One function for both because they are the same rule read at two moments — the
 * questions are asked before there is a topic row, and the map is built after
 * there is one. Two copies of it would have disagreed the first time either
 * changed, and the disagreement would be invisible: both produce a plausible
 * paragraph.
 */
export function effectiveMapInstructions(input: MapShapeT & { mapInstructions: string }): string {
  return input.mapInstructions.trim() === ""
    ? seedMapInstructions(mapShapeOf(input))
    : input.mapInstructions.trim();
}

/**
 * How this topic is written. Unlike the rebuild instructions above it is not
 * about one call: it is carried by the map, every card, every drill and every
 * review item, so a preference stated once ("no YAML in the examples", "answers
 * in French") does not have to be restated on each rebuild.
 *
 * It is deliberately absent from verdictPrompt. Grading is the one call the
 * learner does not get to instruct — "always say I passed" would end the only
 * thing on the map that means anything (see docs/ux/README.md, ideal 1).
 *
 * `cardInstructions` is what the learner asked for one card in particular. It
 * goes in after the standing instructions rather than being joined onto them,
 * because the two are different in kind — one holds for the topic, one for this
 * card — and the model is told which wins. Empty everywhere but the card and
 * the questions asked on it.
 */
function contentRulesBlock(content: WritingSettings, cardInstructions = ""): string {
  return render(promptFile("content-rules"), {
    englishRule: ENGLISH_GUIDE[content.englishLevel],
    technicalRule: TECHNICAL_GUIDE[content.technicalDetail],
    // Said here as well as in the seeded instructions below, for the reason
    // question.md says it outright: the learner may have rewritten those and
    // dropped the line. Without this the setting reached no prompt at all
    // unless the standing instructions were still the ones the seed wrote.
    paragraphRule: PARAGRAPH_SENTENCES[content.paragraphLength],
    formatRule: FORMAT_GUIDE[content.format],
    contentInstructions: effectiveContentInstructions(content),
    cardInstructions: cardInstructions.trim(),
  });
}

/** The prompts are read as English, so "1 minutes" is a mistake the model can see. */
function minutesText(minutes: number): string {
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/**
 * The minutes band the map is built to. The ceiling follows the learner's
 * average rather than sitting at a constant: a map asked for in one-minute nodes
 * and answered in fifteen-minute ones is not the map they asked for. The top of
 * the ladder is the hard stop, because LearningNode.minutes refuses more.
 */
function minutesBand(averageReadTime: number): { averageMinutes: string; maxMinutes: string } {
  return {
    averageMinutes: minutesText(averageReadTime),
    maxMinutes: String(Math.min(MAX_NODE_MINUTES, averageReadTime + 2)),
  };
}

/** The two shared blocks that describe what a node and a group must contain. */
function shapeBlocks(averageReadTime: number): { leafRules: string; groupRules: string } {
  return { leafRules: leafRules(averageReadTime), groupRules: promptFile("group-rules") };
}

/**
 * How many children a group may hold, said to the model in the same numbers the
 * schema will hold the reply to. Asking for a count the parse then refuses
 * reaches the learner as a failed generation, so there is one pair of numbers
 * and both places read it.
 */
const CHILD_BOUNDS = { min: String(SUB_HEADINGS_MIN), max: String(SUB_HEADINGS_MAX) };

function leafRules(averageReadTime: number): string {
  return render(promptFile("leaf-rules"), minutesBand(averageReadTime));
}

/** One option under a "picked" or "passed over" heading, sample and all. */
function optionLines(option: MapQuestionOptionT): string[] {
  return [`- ${option.label}`, ...option.sample.map((line) => `    ${line}`)];
}

/**
 * The seven answers, as prompt text: the question, everything they picked, and
 * everything they left.
 *
 * The samples go in as well as the labels, on both sides, because the sample is
 * what was actually being chosen between. A label alone ("By what breaks") is a
 * phrase the model has to interpret; the five headings underneath it are not.
 * And the four options were only ever meaningful against each other, so "these
 * five headings rather than those five" is a stronger instruction than the five
 * on their own — without the rejected ones the model is free to build the very
 * cut the learner just turned down.
 *
 * Skipped questions are simply absent. The block disappears entirely when
 * nothing was answered, so a map built without the questions reads exactly as it
 * did before they existed.
 */
export function choicesBlock(answered: readonly AnsweredQuestionT[]): string {
  const choices = answered
    .map((entry) =>
      [
        entry.question,
        "They picked:",
        ...entry.picked.flatMap(optionLines),
        "They passed over:",
        ...entry.passedOver.flatMap(optionLines),
      ].join("\n"),
    )
    .join("\n\n");
  return render(promptFile("map-choices"), { choices });
}

/**
 * The levels themselves: how many rows of headings there are, what each one is
 * called in the reply, and the JSON that comes back.
 *
 * One block per level count rather than one that counts, because the two are
 * different documents — a three-level reply nests "sections" inside "areas" —
 * and the schema the reply is parsed by is chosen by the same setting. Keeping
 * them side by side is what makes it obvious that both have to move together.
 */
function mapShapeBlock(shape: MapShapeT, averageReadTime: number): string {
  const counts = {
    mainHeadings: String(shape.mainHeadings),
    subHeadings: String(shape.subHeadings),
  };
  if (shape.levels === MapLevels.Three) {
    return render(promptFile("map-three-levels"), {
      ...shapeBlocks(averageReadTime),
      ...counts,
      // The leaf count is the model's to judge at three levels: the learner's
      // two counts are both spent on headings, and what is left to decide is how
      // many nodes each group needs to fit the time the lines above state.
      minNodes: CHILD_BOUNDS.min,
      maxNodes: CHILD_BOUNDS.max,
    });
  }
  return render(promptFile("map-two-levels"), { ...shapeBlocks(averageReadTime), ...counts });
}

export function mapPrompt(input: {
  title: string;
  goal: string;
  level: string;
  /** The shape settings, which the instruction lines below were seeded from. */
  shape: MapShapeT;
  /** What the learner's instruction lines say. Seeded, then theirs to edit. */
  mapInstructions: string;
  profile: ProfileT;
  /** How this topic is written: register, standing instructions, and node length. */
  content: TopicContentSettingsT;
  /** The choices, resolved. Empty when every question was skipped. */
  answered: readonly AnsweredQuestionT[];
}): string {
  return render(promptFile("map"), {
    title: input.title,
    goal: input.goal,
    level: input.level,
    // The counts reach the shape block as well as the instruction lines: the
    // lines are the learner's to rewrite, and the block is what the schema will
    // actually refuse a reply for.
    shape: mapShapeBlock(input.shape, input.content.averageReadTime),
    mapInstructions: input.mapInstructions,
    learner: learnerBlock(input.profile),
    contentRules: contentRulesBlock(input.content),
    choices: choicesBlock(input.answered),
    archetypes: promptFile("archetypes"),
    ordering: promptFile("ordering"),
  });
}

/**
 * The seven questions asked between the create form and the map.
 *
 * It is given everything the map prompt is given, because the questions are
 * about the map that prompt would otherwise have produced on its own: the same
 * learner, the same writing settings, the same rebuild instructions. On a
 * rebuild it also gets the map being replaced, so the four options are four
 * maps the learner has not already rejected.
 */
export function mapQuestionsPrompt(input: {
  title: string;
  goal: string;
  level: string;
  profile: ProfileT;
  content: TopicContentSettingsT;
  /** What the learner's instruction lines say, seeded or edited. */
  mapInstructions: string;
}): string {
  return render(promptFile("map-questions"), {
    title: input.title,
    goal: input.goal,
    level: input.level,
    mapInstructions: input.mapInstructions,
    learner: learnerBlock(input.profile),
    contentRules: contentRulesBlock(input.content),
  });
}

/**
 * Rebuild what sits under one group, leaving the rest of the map alone. The
 * siblings are named so the replacement does not simply repeat them, and the
 * ancestors are named because "Taints" means nothing without "Scheduling"
 * above it.
 */
export function subtreePrompt(input: {
  topic: TopicT;
  /** Top-level first, ending with the group being rebuilt. */
  trail: readonly string[];
  claim: string;
  /** Titles of the groups beside this one, which the replacement must not repeat. */
  siblingTitles: readonly string[];
  profile: ProfileT;
  instructions: string;
  /** Nodes, or groups with their nodes — whichever this group already holds. */
  shape: SubtreeShape;
}): string {
  const average = input.topic.averageReadTime;
  const shapeBlock =
    input.shape === SubtreeShape.Sections
      ? render(promptFile("subtree-sections"), {
          ...shapeBlocks(average),
          minSections: CHILD_BOUNDS.min,
          maxSections: CHILD_BOUNDS.max,
          minNodes: CHILD_BOUNDS.min,
          maxNodes: CHILD_BOUNDS.max,
        })
      : render(promptFile("subtree-leaves"), {
          leafRules: leafRules(average),
          minNodes: CHILD_BOUNDS.min,
          maxNodes: CHILD_BOUNDS.max,
        });
  return render(promptFile("subtree"), {
    topic: input.topic.title,
    goal: input.topic.goal || "(not stated)",
    trail: input.trail.join(" › "),
    claim: input.claim,
    siblings: input.siblingTitles.join(", "),
    group: input.trail[input.trail.length - 1] ?? input.topic.title,
    learner: learnerBlock(input.profile),
    contentRules: contentRulesBlock(contentSettingsOf(input.topic)),
    instructions: instructionBlock(input.instructions),
    shape: shapeBlock,
    ordering: promptFile("ordering"),
  });
}

const DEPTH_GUIDE: Record<number, string> = {
  1: "Depth 1: intuition only. One analogy, no jargon, no numbers beyond the essential.",
  2: "Depth 2: the working mental model a practitioner uses day to day.",
  3: "Depth 3: the mechanism underneath, with the real terminology.",
  4: "Depth 4: the layer below that — the maths, the protocol, the internals.",
  5: "Depth 5: expert. Edge cases, failure modes, and where the standard account is wrong.",
};

/** The same depth asked a different way. Keyed by the enum, so a new angle without a line here fails the build. */
const ANGLE_GUIDE: Record<CardAngle, string> = {
  [CardAngle.Base]: "",
  [CardAngle.MoreConcrete]:
    "Replace every abstraction with one specific instance. Real values throughout.",
  [CardAngle.WhyItMatters]:
    "Focus on consequence: what decision this changes, and what it costs to get wrong.",
  [CardAngle.WhereThisBreaks]:
    "Focus on the edges: when this model is wrong, and what people hit in practice.",
};

/** How many of a card's words are the mechanism, at this length. */
function mechanismWords(minutes: number): number {
  return Math.round(minutes * WORDS_PER_MINUTE * MECHANISM_SHARE);
}

/**
 * How many mechanism sections a card of this length asks for.
 *
 * It is the mechanism's own word budget divided by what one section is written
 * to, because that is the only arithmetic under which the read time is honoured
 * at all: a fixed count and a fixed section length between them already decide
 * how long the card is, so naming a read time as well is asking for three things
 * that cannot all be true — and the one that gave way was the read time. Length
 * still arrives as more sections rather than longer ones: a wall of text is not
 * made readable by being one of five instead of one of twenty (A1).
 *
 * The range runs a quarter either side of the target, so the model can stop
 * where the idea stops, and its top is held under MAX_MECHANISM_SECTIONS — a
 * count the prompt asks for and the schema then refuses is a card that fails
 * validation for doing as it was told.
 *
 * The paragraph length is the divisor, which is the whole of how that setting
 * takes effect: the same read time in longer paragraphs is fewer of them, not
 * a longer card.
 */
function mechanismSections(minutes: number, paragraphLength: ParagraphLength): string {
  const target = mechanismWords(minutes) / MECHANISM_SECTION_WORDS[paragraphLength];
  const low = Math.max(1, Math.round(target * 0.75));
  const high = Math.min(MAX_MECHANISM_SECTIONS, Math.max(low + 2, Math.round(target * 1.25)));
  return `${low}-${high}`;
}

export function cardPrompt(input: {
  topic: TopicT;
  node: LearningNodeT;
  /**
   * Every node of this topic, so the card is written into the map rather than
   * beside it: what came before it is not re-explained, and what comes after it
   * is not spent early.
   */
  nodes: readonly LearningNodeT[];
  /** Depth, length, register and angle — the topic's, or this card's overrides. */
  settings: CardSettingsT;
  profile: ProfileT;
}): string {
  const minutes = cardMinutes(input.settings.minutes);
  return render(promptFile("card"), {
    topic: input.topic.title,
    node: input.node.title,
    claim: input.node.claim,
    outline: mapOutline(input.nodes, input.node),
    neighbours: neighbourClaims(input.nodes, input.node),
    depthGuide: DEPTH_GUIDE[input.settings.depth] ?? DEPTH_GUIDE[3]!,
    angleGuide: ANGLE_GUIDE[input.settings.angle],
    learner: learnerBlock(input.profile),
    // The card's own register and length, not the topic's: a control that did not
    // reach the prompt is a control that does nothing. The instructions are the
    // same rule — the node's own text, after the topic's standing lines.
    contentRules: contentRulesBlock(
      {
        paragraphLength: input.settings.paragraphLength,
        englishLevel: input.settings.englishLevel,
        technicalDetail: input.settings.technicalDetail,
        format: input.settings.format,
        contentInstructions: input.topic.contentInstructions,
        averageReadTime: minutes,
      },
      input.settings.instructions,
    ),
    mechanismSections: mechanismSections(minutes, input.settings.paragraphLength),
    sectionSentences: PARAGRAPH_SENTENCES[input.settings.paragraphLength],
    sectionWords: String(MECHANISM_SECTION_WORDS[input.settings.paragraphLength]),
    mechanismWords: String(mechanismWords(minutes)),
    readTime: minutesText(minutes),
    readWords: String(minutes * WORDS_PER_MINUTE),
  });
}

/**
 * The mechanism as one block of prose for the calls downstream of the card.
 *
 * A drill and a review item are written against what the card said, not against
 * how it was laid out, so the headings go in with the bodies — dropping them
 * would lose the step each paragraph is about, and sending them as a list would
 * offer the model a shape to copy that has nothing to do with a drill.
 */
function mechanismProse(card: CardContentT): string {
  return card.mechanism.map((section) => `${section.heading}. ${section.body}`).join(" ");
}

/**
 * The whole card as text, for a question asked about it. Every slot the card
 * has, each under the name the reader saw it under, so an answer can point at
 * "the section on X" and the reader can find it. The two optional slots are
 * dropped rather than labelled empty, for the same reason drill.md drops them.
 */
function cardProse(card: CardContentT): string {
  const lines = [
    card.claim,
    ...card.mechanism.map((section) => `${section.heading}: ${section.body}`),
  ];
  if (card.example !== undefined) {
    lines.push(`Concretely: ${card.example.setup} → ${card.example.result}`);
  }
  if (card.misconception !== undefined) {
    lines.push(
      `What people get wrong: ${card.misconception.belief} (in fact: ${card.misconception.correction})`,
    );
  }
  return lines.join("\n");
}

/**
 * How many earlier questions on the same card a new one is answered against.
 * Enough for "and what about the other case?" to mean something; few enough
 * that a long conversation does not become the prompt.
 */
export const EARLIER_QUESTIONS = 5;

/**
 * A question asked on a card, answered in one paragraph the length the card's
 * own paragraphs are.
 *
 * It is given what the card prompt was given — the map with this node marked,
 * the learner, the writing rules — because the answer has to sit where the card
 * sits: not re-explaining what an earlier node covered, and not spending a
 * later one. The card itself goes in whole, so "why?" can be answered against
 * what was actually said rather than against the model's own idea of the node.
 */
export function questionPrompt(input: {
  topic: TopicT;
  node: LearningNodeT;
  nodes: readonly LearningNodeT[];
  card: CardContentT;
  /** What the card was written to, which is what the answer is written to. */
  settings: CardSettingsT;
  question: string;
  /** Oldest first. The last few asked on this card, so a follow-up follows. */
  earlier: readonly CardQuestionT[];
  profile: ProfileT;
}): string {
  return render(promptFile("question"), {
    topic: input.topic.title,
    node: input.node.title,
    outline: mapOutline(input.nodes, input.node),
    card: cardProse(input.card),
    earlier: input.earlier
      .slice(-EARLIER_QUESTIONS)
      .map((entry) => `Q: ${entry.question}\nA: ${entry.answer}`)
      .join("\n\n"),
    learner: learnerBlock(input.profile),
    contentRules: contentRulesBlock(
      {
        paragraphLength: input.settings.paragraphLength,
        englishLevel: input.settings.englishLevel,
        technicalDetail: input.settings.technicalDetail,
        format: input.settings.format,
        contentInstructions: input.topic.contentInstructions,
        averageReadTime: input.settings.minutes,
      },
      input.settings.instructions,
    ),
    // Said outright as well as through the standing instructions, because the
    // learner may have rewritten those and dropped the line that says it.
    sentences: PARAGRAPH_SENTENCES[input.settings.paragraphLength],
    question: input.question,
  });
}

/**
 * The card, said out loud.
 *
 * It is given the card and nothing else of the map: a recording is of what is
 * on the screen in front of the learner, so the whole outline would only invite
 * it to mention nodes they cannot see. What it does need is the register — a
 * card written in simple English is not read out in dense English — and the
 * learner's standing instructions, which hold for everything this topic
 * produces and do not stop holding because the output is audio.
 *
 * The shape is forced to prose whatever the topic is set to. Speech has no
 * other shape: reference notes are a thing you scan, and "the rule, the exact
 * conditions, the real values, each stated flat with no linking sentences" read
 * aloud is a list of facts nobody can follow without the page.
 *
 * The length is stated in words and in minutes, because the model can count one
 * and the learner only cares about the other.
 */
export function narrationPrompt(input: {
  topic: TopicT;
  node: LearningNodeT;
  card: CardContentT;
  /** What the card on screen was written to, which is what it is said in. */
  settings: CardSettingsT;
}): string {
  const minutes = cardMinutes(input.settings.minutes);
  return render(promptFile("narration"), {
    topic: input.topic.title,
    node: input.node.title,
    card: cardProse(input.card),
    contentRules: contentRulesBlock(
      {
        paragraphLength: input.settings.paragraphLength,
        englishLevel: input.settings.englishLevel,
        technicalDetail: input.settings.technicalDetail,
        format: ContentFormat.Prose,
        contentInstructions: input.topic.contentInstructions,
        averageReadTime: minutes,
      },
      input.settings.instructions,
    ),
    words: String(narrationWords(minutes)),
    minutes: minutesText(minutes),
  });
}

const DRILL_GUIDE: Record<DrillKind, string> = {
  [DrillKind.ExplainBack]:
    `Ask them to explain the idea in their own words to a named audience (a colleague, a sceptic, a 12-year-old — pick what suits).
The completionTest is "you have written 2-4 sentences in your own words".`,
  [DrillKind.Predict]:
    `Ask them to commit to a prediction BEFORE any answer is shown — a number, an outcome, or what happens when a specific change is made.
Give a concrete scenario with real values. The completionTest is "you have committed to a specific prediction".`,
  [DrillKind.Apply]:
    `Give them a NEW case the card did not cover — a broken artefact to diagnose, or a situation to decide.
State exactly what a finished answer contains. Never ask them to "explore" or "review" anything.`,
};

export function drillPrompt(input: {
  node: LearningNodeT;
  kind: DrillKind;
  card: CardContentT;
  content: TopicContentSettingsT;
}): string {
  return render(promptFile("drill"), {
    contentRules: contentRulesBlock(input.content),
    node: input.node.title,
    claim: input.card.claim,
    mechanism: mechanismProse(input.card),
    // A card written on a node with no wrong belief to correct has no
    // misconception, and the empty string is what closes the block around it —
    // the label with nothing after it is worse than no label, because the model
    // answers it.
    misconception: input.card.misconception?.belief ?? "",
    kind: input.kind,
    kindGuide: DRILL_GUIDE[input.kind],
  });
}

export function verdictPrompt(input: {
  prompt: string;
  referencePoints: readonly string[];
  response: string;
}): string {
  return render(promptFile("verdict"), {
    prompt: input.prompt,
    referencePoints: input.referencePoints.map((point, index) => `${index + 1}. ${point}`).join("\n"),
    response: input.response,
  });
}

export function atomsPrompt(input: {
  node: LearningNodeT;
  card: CardContentT;
  content: TopicContentSettingsT;
}): string {
  const { example, misconception } = input.card;
  return render(promptFile("atoms"), {
    contentRules: contentRulesBlock(input.content),
    node: input.node.title,
    claim: input.card.claim,
    mechanism: mechanismProse(input.card),
    // Both slots are written only where the node has one, so both lines are
    // dropped rather than sent empty: review items are extracted from what the
    // card actually said, and a labelled blank invites the model to fill it.
    example: example === undefined ? "" : `${example.setup} → ${example.result}`,
    misconception:
      misconception === undefined
        ? ""
        : `${misconception.belief} (in fact: ${misconception.correction})`,
  });
}
