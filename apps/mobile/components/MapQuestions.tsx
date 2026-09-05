import { useState } from "react";
import { Pressable, View } from "react-native";
import type { ReactElement } from "react";
import { Button, InlineMarkdown, SectionTitle, Text } from "@interestled/ui";
import type { MapAnswerT, MapQuestionT } from "@interestled/schemas";
import {
  MapQuestionOption,
  pickedIndexes,
  pickedOptions,
  toggleAnswer,
} from "./MapQuestionOption";

/**
 * The seven choices, one at a time.
 *
 * They exist because the create form says what someone wants and not what the
 * map should look like, and the model's first guess at the second thing is the
 * one decision nobody gets to correct until the whole map is built and wrong.
 * Four samples side by side is a decision anyone can make in two seconds and
 * nobody could have written down.
 *
 * One question per screen, and every one skippable. Seven mandatory questions
 * between "I want to learn this" and the map would be exactly the setup cost
 * A14 bans — and a skipped question is genuinely absent from the prompt rather
 * than answered with a default nobody chose.
 */
export function MapQuestions({
  questions,
  answers,
  onAnswers,
  finishLabel,
  busy,
  summarise = true,
  onFinish,
}: {
  questions: readonly MapQuestionT[];
  /** The answers so far, held by whoever will build the map with them. */
  answers: readonly MapAnswerT[];
  onAnswers: (answers: MapAnswerT[]) => void;
  /** What the last button says — "Review it", or "Build it again". */
  finishLabel: string;
  busy: boolean;
  /**
   * Whether the last question is followed by a what-you-picked step.
   *
   * The rebuild sheet has nowhere else to show one, so it keeps it. The create
   * flow does not: it hands off to the review screen, which says the same thing
   * about the choices and the rest of the form beside it, and two summaries in
   * a row read as the app asking twice.
   */
  summarise?: boolean;
  onFinish: (answers: readonly MapAnswerT[]) => void;
}): ReactElement {
  // One step past the last question is the summary, which is where the finish
  // button lives — so nobody builds a map by tapping an option they misread.
  const summary = questions.length;
  const [step, setStep] = useState(0);
  // Set when a question is reopened from the summary, so answering it goes back
  // there rather than walking through every question after it a second time.
  const [returning, setReturning] = useState(false);

  const last = step === questions.length - 1;

  /**
   * Past the last question: the summary where there is one, and the answers
   * handed on where there is not.
   */
  const finish = (kept: readonly MapAnswerT[]): void => {
    setReturning(false);
    if (summarise) {
      setStep(summary);
      return;
    }
    onFinish(kept);
  };

  const advance = (): void => {
    if (returning || last) {
      finish(answers);
      return;
    }
    setStep(step + 1);
  };

  const toggle = (question: MapQuestionT, optionIndex: number): void =>
    onAnswers(toggleAnswer(answers, question.kind, optionIndex));

  const reopen = (at: number): void => {
    setReturning(true);
    setStep(at);
  };

  /**
   * Straight past the rest, with everything from here on left unanswered.
   * Without it the learner who has said what they care about has to tap "Skip
   * this one" four more times to get to the button, which is the same setup cost
   * making every question skippable was meant to avoid.
   */
  const skipRest = (): void => {
    const remaining = new Set(questions.slice(step).map((entry) => entry.kind));
    const kept = answers.filter((answer) => !remaining.has(answer.kind));
    onAnswers(kept);
    finish(kept);
  };

  const question = questions[step];
  if (question === undefined) {
    return (
      <View className="gap-4">
        <SectionTitle>What you picked</SectionTitle>
        {questions.map((entry, index) => {
          const picked = pickedOptions(entry, answers);
          return (
            <Pressable
              key={entry.kind}
              accessibilityRole="button"
              accessibilityLabel={`Change your answer: ${entry.question}`}
              disabled={busy}
              onPress={() => reopen(index)}
              className="gap-1 border-b border-line pb-3"
            >
              {/* Every line here is model-written, so every line is Markdown. */}
              <InlineMarkdown text={entry.question} className="text-xs text-ink-faint" />
              {picked.length === 0 ? (
                <Text className="text-sm text-ink-faint">Skipped</Text>
              ) : (
                picked.map((option) => (
                  <InlineMarkdown
                    key={option.label}
                    text={option.label}
                    className="text-sm text-ink"
                  />
                ))
              )}
            </Pressable>
          );
        })}
        <Button label={finishLabel} onPress={() => onFinish(answers)} busy={busy} />
      </View>
    );
  }

  const picked = pickedIndexes(answers, question.kind);
  return (
    <View className="gap-4">
      <View className="gap-1">
        <SectionTitle>{`${step + 1} of ${questions.length}`}</SectionTitle>
        <InlineMarkdown text={question.question} className="text-base font-medium text-ink" />
        <Text className="text-sm text-ink-soft">Pick as many as you want.</Text>
      </View>

      <View className="gap-3">
        {question.options.map((option, index) => (
          <MapQuestionOption
            key={`${question.kind}-${index}`}
            option={option}
            selected={picked.includes(index)}
            onPress={() => toggle(question, index)}
          />
        ))}
      </View>

      {/*
       * One button rather than a Next beside a Skip: pressing on with nothing
       * picked IS skipping, and two controls for one action leave the learner
       * working out which of them they meant. The label says which it is.
       */}
      <Button
        label={nextLabel(picked.length > 0, last && !summarise, finishLabel)}
        tone={picked.length === 0 ? "secondary" : "primary"}
        onPress={advance}
      />

      <View className="flex-row gap-2">
        {step > 0 || returning ? (
          <View className="flex-1">
            <Button
              label="Back"
              tone="secondary"
              onPress={() => {
                setStep(returning ? summary : step - 1);
                setReturning(false);
              }}
            />
          </View>
        ) : null}
        {step < questions.length - 1 && !returning ? (
          <View className="flex-1">
            <Button label="Skip the rest" tone="secondary" onPress={skipRest} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * What the one button says: skipping, moving on, or — on the last question of a
 * run with no summary after it — where it is about to take them.
 */
function nextLabel(answered: boolean, handingOn: boolean, finishLabel: string): string {
  if (handingOn) {
    return finishLabel;
  }
  return answered ? "Next" : "Skip this one";
}
