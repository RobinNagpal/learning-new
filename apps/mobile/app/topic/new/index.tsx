import { useState } from "react";
import { Text } from "react-native";
import type { ReactElement } from "react";
import { router } from "expo-router";
import { useMapQuestions } from "@interestled/api";
import { Button, ErrorState, Screen, Input, Sheet } from "@interestled/ui";
import type { MapAnswerT } from "@interestled/schemas";
import { messageOf } from "../../../lib/errors";
import { clearMapDraft, setMapDraft, topicCreateInput, useMapDraft } from "../../../lib/mapDraft";
import { useHardwareBack } from "../../../lib/nav";
import { MapQuestions } from "../../../components/MapQuestions";
import { MapShapeFields } from "../../../components/MapShapeFields";

/** Where the choices, and then the map itself, are checked before anything is built. */
const REVIEW = "/topic/new/review";

/**
 * Three questions, then the shape of the map.
 *
 * The three are what the map cannot be built without: what to learn, what for,
 * and what they already know. The last is the highest-value answer on the
 * screen — it decides which whole branches are dropped before the learner ever
 * sees them, and two of the generated questions ask about it directly. Both long
 * answers are boxes asking for points rather than one line each, because "deploy
 * a service" and "debug it at 3am" are different answers and a single line
 * quietly asks people to pick one.
 *
 * Where they want to get to used to be half of the third question and is now the
 * depth chip, because "the mechanism underneath" is a thing the map can be built
 * to and a sentence about ambition is not.
 *
 * Between the form and the map sit the seven choices, and then the review screen
 * that shows both together. Nothing on this screen is component state: it is all
 * in the draft (lib/mapDraft.ts), which is what survives the walk through those
 * two screens and a build that fails at the end of them.
 */
export default function NewTopicScreen(): ReactElement {
  // The bar for this screen is set in the navigator; this is the same answer for
  // Android's own button.
  useHardwareBack("/");
  const draft = useMapDraft();
  const questions = useMapQuestions();
  // The choices are asked on the way to generating rather than as more fields:
  // they are about the map, not about the learner, and they only matter at the
  // moment the button is pressed.
  const [asking, setAsking] = useState(false);
  // Whether the choices being written are a second set, over a plan that is
  // already answered. The sheet needs to know: without it, pressing "ask again"
  // shows the OLD seven questions immediately, and the learner answers a set
  // that is replaced under them the moment the call lands — along with every
  // pick they just made. A failure has nowhere to be shown either.
  const [rewriting, setRewriting] = useState(false);

  const ask = (): void => {
    setAsking(true);
    setRewriting(draft.plan !== null);
    // Answers are indexes into the four options of the set they were asked
    // against, so a new set has to arrive with the old answers dropped.
    questions.mutate(topicCreateInput(draft), {
      onSuccess: (plan) => {
        setMapDraft({ plan, answers: [] });
        setRewriting(false);
      },
      // The plan already there is kept, so a failed re-ask costs nothing: the
      // sheet says what went wrong over the choices that still stand.
      onError: () => setRewriting(false),
    });
  };

  /**
   * The choices the sheet may show: the ones there are, unless a second set is
   * being written over them — while that is in flight there is nothing to
   * answer, because the answers would be indexes into a set about to be gone.
   */
  const plan = rewriting ? null : draft.plan;

  /** Whether there is anything here worth offering to clear. */
  const started =
    draft.title !== "" || draft.goal !== "" || draft.level !== "" || draft.plan !== null;

  const review = (answers: readonly MapAnswerT[]): void => {
    setMapDraft({ answers: [...answers] });
    setAsking(false);
    router.push(REVIEW);
  };

  return (
    <Screen contentContainerClassName="gap-5 p-4">
      <Input
        label="What do you want to learn?"
        value={draft.title}
        onChangeText={(title) => setMapDraft({ title })}
        placeholder="Kubernetes"
        maxLength={120}
        autoFocus
      />
      <Input
        label="How do you plan to use this? Two or three points."
        value={draft.goal}
        onChangeText={(goal) => setMapDraft({ goal })}
        multiline
        maxLength={600}
        placeholder={"Deploy a service\nRead the logs when it breaks\nSize it without guessing"}
        hint="This picks the shortest path through the map."
      />
      <Input
        label="What do you already know about it?"
        value={draft.level}
        onChangeText={(level) => setMapDraft({ level })}
        multiline
        maxLength={600}
        placeholder={"I use Docker daily\nI have never run anything in production"}
        hint="This is the answer that saves you the most time — it is what gets left out."
      />

      <MapShapeFields
        shape={draft.shape}
        onShape={(shape) => setMapDraft({ shape })}
        instructions={draft.mapInstructions}
        onInstructions={(mapInstructions) => setMapDraft({ mapInstructions })}
        instructionsEdited={draft.instructionsEdited}
        onInstructionsEdited={() => setMapDraft({ instructionsEdited: true })}
      />

      {/* Answered once, the seven choices are kept: coming back here to change a
          field must not throw them away, and asking again is a model call, so it
          is a press of its own rather than the price of returning. */}
      {draft.plan === null ? (
        <Button
          label="Next: seven quick choices"
          onPress={ask}
          disabled={draft.title.trim().length < 2}
        />
      ) : (
        <>
          <Button label="Review and build" onPress={() => router.push(REVIEW)} />
          <Button label="Ask for new choices" tone="quiet" onPress={ask} />
        </>
      )}

      {/* The draft outlives the screen, so a topic somebody started and walked
          away from is still here days later. Without this the only way past it
          is deleting three boxes by hand. */}
      {started ? <Button label="Start over" tone="quiet" onPress={clearMapDraft} /> : null}

      <Sheet
        visible={asking}
        title={plan === null ? "Writing your choices" : "Which of these do you want?"}
        body={
          plan === null
            ? "Four samples per question, seven questions, and any of them can be skipped."
            : "Seven choices, and any of them can be skipped."
        }
        onClose={() => (questions.isPending ? undefined : setAsking(false))}
      >
        {plan === null ? (
          <>
            {questions.isError ? <ErrorState message={messageOf(questions.error)} /> : null}
            {questions.isPending ? (
              <Text className="text-center text-sm text-ink-faint">
                One model call, usually 10–30 seconds.
              </Text>
            ) : (
              <Button label="Try again" onPress={ask} />
            )}
          </>
        ) : (
          <MapQuestions
            questions={plan.questions}
            answers={draft.answers}
            onAnswers={(answers) => setMapDraft({ answers })}
            finishLabel="Review it"
            busy={false}
            // The review screen says what was picked, beside everything else the
            // map is being built from. A summary here would be the same list,
            // one press earlier.
            summarise={false}
            onFinish={review}
          />
        )}
      </Sheet>
    </Screen>
  );
}
