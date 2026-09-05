import { Pressable, View } from "react-native";
import type { ReactElement } from "react";
import { InlineMarkdown, Markdown } from "@interestled/ui";
import type {
  MapAnswerT,
  MapQuestionKind,
  MapQuestionOptionT,
  MapQuestionT,
} from "@interestled/schemas";

/**
 * One of the four: the label, and the sample under it. The sample is the taller
 * half on purpose — it is the thing being chosen, and the label is only there so
 * a list of what was picked has something to say afterwards.
 *
 * Both are model-written, so both go through the Markdown components: a sample
 * of code is written in backticks, and a plain `<Text>` would put the backticks
 * on the screen.
 *
 * Its own file because two screens show these — one question at a time on the
 * way through, and any one of the seven reopened on the review screen — and a
 * second copy of the selected state is a second thing to get subtly different.
 */
export function MapQuestionOption({
  option,
  selected,
  onPress,
}: {
  option: MapQuestionOptionT;
  selected: boolean;
  onPress: () => void;
}): ReactElement {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={option.label}
      onPress={onPress}
      className={`gap-2 rounded-card border p-3 ${
        selected ? "border-accent bg-accent-tint" : "border-line-strong bg-surface"
      }`}
    >
      <InlineMarkdown text={option.label} className="text-sm font-semibold text-ink" />
      <View className="gap-1">
        {option.sample.map((line, index) => (
          <Markdown key={index} text={line} className="text-sm text-ink-soft" />
        ))}
      </View>
    </Pressable>
  );
}

/**
 * Add or remove one option. Toggling the last one off drops the answer rather
 * than leaving it empty, because a question with nothing picked is a skipped
 * question and the two must not be different things.
 *
 * Shared for the same reason as the card above: the stepper and the review
 * screen both edit the same answers, and an answer left present and empty by
 * one of them is refused by the schema on the way to the server.
 */
export function toggleAnswer(
  answers: readonly MapAnswerT[],
  kind: MapQuestionKind,
  optionIndex: number,
): MapAnswerT[] {
  const existing = answers.find((answer) => answer.kind === kind);
  const others = answers.filter((answer) => answer.kind !== kind);
  const was = existing?.optionIndexes ?? [];
  const next = was.includes(optionIndex)
    ? was.filter((index) => index !== optionIndex)
    : [...was, optionIndex].sort((a, b) => a - b);
  return next.length === 0 ? others : [...others, { kind, optionIndexes: next }];
}

/** Which of the four this question's answer names, or none when it was skipped. */
export function pickedIndexes(
  answers: readonly MapAnswerT[],
  kind: MapQuestionKind,
): readonly number[] {
  return answers.find((answer) => answer.kind === kind)?.optionIndexes ?? [];
}

/** Every option the learner picked, in the order they were shown. */
export function pickedOptions(
  question: MapQuestionT,
  answers: readonly MapAnswerT[],
): MapQuestionOptionT[] {
  const picked = new Set(pickedIndexes(answers, question.kind));
  return question.options.filter((_option, index) => picked.has(index));
}
