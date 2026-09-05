import { Pressable, View } from "react-native";
import type { ReactElement } from "react";
import { InlineMarkdown, Markdown, Text } from "@interestled/ui";
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

/**
 * What one question was answered with: the question, and the labels picked under
 * it — or "Skipped", which is a real answer here rather than a blank.
 *
 * Drawn in two places, which is why it is not written twice: the stepper's
 * what-you-picked step, which the rebuild sheet keeps, and the review screen.
 * `action` is the word on the right of the question, since both are pressed to
 * change the answer and both should say so.
 */
export function AnsweredSummary({
  question,
  answers,
  action,
}: {
  question: MapQuestionT;
  answers: readonly MapAnswerT[];
  action: string;
}): ReactElement {
  const picked = pickedIndexes(answers, question.kind);
  return (
    <>
      <View className="flex-row items-baseline justify-between gap-3">
        {/* Every line of this is model-written, so every line is Markdown. */}
        <InlineMarkdown text={question.question} className="flex-1 text-xs text-ink-faint" />
        <Text className="text-xs font-semibold text-accent">{action}</Text>
      </View>
      {picked.length === 0 ? (
        <Text className="text-sm text-ink-faint">Skipped</Text>
      ) : (
        // Keyed by which of the four it is, never by the label: the labels are
        // model-written, and two of them coming back the same is a bad
        // generation rather than an impossible one.
        picked.map((index) => (
          <InlineMarkdown
            key={`${question.kind}-${index}`}
            text={question.options[index]?.label ?? ""}
            className="text-sm text-ink"
          />
        ))
      )}
    </>
  );
}
