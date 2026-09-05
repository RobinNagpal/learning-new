import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { ReactElement } from "react";
import { router } from "expo-router";
import { ApiError, useCreateTopic, useRegenerateTopic } from "@interestled/api";
import { topicHref } from "@interestled/domain";
import {
  Button,
  Disclosure,
  ErrorState,
  Input,
  Screen,
  SectionTitle,
  mapShapeSummary,
} from "@interestled/ui";
import type { MapAnswerT, MapQuestionT } from "@interestled/schemas";
import { messageOf } from "../../../lib/errors";
import { clearMapDraft, setMapDraft, topicCreateInput, useMapDraft } from "../../../lib/mapDraft";
import { useHardwareBack } from "../../../lib/nav";
import {
  AnsweredSummary,
  MapQuestionOption,
  pickedIndexes,
  toggleAnswer,
} from "../../../components/MapQuestionOption";
import { MapShapeFields } from "../../../components/MapShapeFields";

/**
 * Everything the map is about to be built from, on one screen, with the button
 * that builds it at the bottom.
 *
 * It is here because building is the expensive, slow, occasionally failing part
 * of the product: a model call that takes half a minute, that CloudFront gives
 * up on at sixty seconds, and that the learner cannot correct afterwards except
 * by building the whole thing again. Everything that decides how it comes out —
 * the three answers, the shape, the lines the model is given, and the seven
 * choices — was until now spread over a form and a sheet, and the last time any
 * of it was visible together was never.
 *
 * The second reason is the failure. Nothing here is component state: it is the
 * draft, which is on disk, so a build that fails leaves the learner on this
 * screen with every answer still in it and one button to press again. That is
 * the whole point — the old sheet lost all of it, and the way back was to
 * answer seven questions for a map that had already been asked for.
 */
export default function ReviewMapScreen(): ReactElement {
  useHardwareBack("/topic/new");
  const draft = useMapDraft();
  const create = useCreateTopic();
  // A build that failed left a topic behind, and the answers are already linked
  // to it — so the retry rebuilds that one. Creating again would leave a second
  // topic with the same title beside the first, and then a third.
  const rebuild = useRegenerateTopic(draft.topicSlug ?? "");
  const busy = create.isPending || rebuild.isPending;
  const error: Error | null = create.error ?? rebuild.error;

  const built = (slug: string): void => {
    clearMapDraft();
    router.replace(topicHref(slug));
  };

  const build = (): void => {
    if (draft.topicSlug !== null) {
      rebuild.mutate(
        {
          ...draft.shape,
          mapInstructions: draft.mapInstructions.trim(),
          planId: draft.plan?.planId,
          answers: draft.answers,
        },
        { onSuccess: (topic) => built(topic.slug) },
      );
      return;
    }
    create.mutate(topicCreateInput(draft), {
      onSuccess: (topic) => built(topic.slug),
      onError: (failure) => {
        // The topic row is written before the map is generated, so a build that
        // failed says which topic it left behind. Holding on to it is what makes
        // the next press a rebuild rather than a second topic.
        if (failure instanceof ApiError && failure.topicSlug !== undefined) {
          setMapDraft({ topicSlug: failure.topicSlug });
        }
      },
    });
  };

  return (
    <Screen contentContainerClassName="gap-5 p-4">
      <Text className="text-sm text-ink-soft">
        Nothing has been built yet. Change anything here, then build it.
      </Text>

      {/* Changing one of these three drops the topic a failed build left behind,
          so the next press creates one carrying the new answer. A rebuild takes
          the shape and the choices and not these, so keeping it would be the app
          quietly ignoring the edit that was just made. */}
      <View className="gap-3">
        <SectionTitle>What you asked for</SectionTitle>
        <Field
          label="What you want to learn"
          value={draft.title}
          empty="Not answered — the map needs this one."
          maxLength={120}
          onChange={(title) => setMapDraft({ title, topicSlug: null })}
        />
        <Field
          label="How you plan to use it"
          value={draft.goal}
          empty="Not answered"
          multiline
          maxLength={600}
          hint="This picks the shortest path through the map."
          onChange={(goal) => setMapDraft({ goal, topicSlug: null })}
        />
        <Field
          label="What you already know"
          value={draft.level}
          empty="Not answered"
          multiline
          maxLength={600}
          hint="This is what gets left out of the map."
          onChange={(level) => setMapDraft({ level, topicSlug: null })}
        />
      </View>

      {/* Folded away with the shape on the closed row: it was set on the screen
          before this one, and it is the part least likely to be changed here. */}
      <Disclosure title="The shape of the map" summary={mapShapeSummary(draft.shape)}>
        <MapShapeFields
          shape={draft.shape}
          onShape={(shape) => setMapDraft({ shape })}
          instructions={draft.mapInstructions}
          onInstructions={(mapInstructions) => setMapDraft({ mapInstructions })}
          instructionsEdited={draft.instructionsEdited}
          onInstructionsEdited={() => setMapDraft({ instructionsEdited: true })}
        />
      </Disclosure>

      <View className="gap-3">
        <SectionTitle>Your choices</SectionTitle>
        {draft.plan === null ? (
          <Text className="text-sm text-ink-faint">
            None were answered. The map will be built from the answers above alone.
          </Text>
        ) : (
          draft.plan.questions.map((question) => (
            <Choice
              key={question.kind}
              question={question}
              answers={draft.answers}
              onAnswers={(answers) => setMapDraft({ answers })}
            />
          ))
        )}
      </View>

      {error === null ? null : (
        <ErrorState
          message={messageOf(error)}
          hint={
            draft.topicSlug === null
              ? "Everything you answered is still here. Press build again — and if it timed out, check your topics first: a build that ran long may have finished anyway."
              : "Everything you answered is still here, and so is the topic. Pressing build again builds that one rather than making another."
          }
        />
      )}

      <Button
        label={buildLabel(busy, draft.topicSlug !== null)}
        onPress={build}
        busy={busy}
        disabled={draft.title.trim().length < 2}
      />
      {busy ? (
        <Text className="text-center text-sm text-ink-faint">
          One model call, usually 10–30 seconds. Leaving this screen does not stop it.
        </Text>
      ) : null}
      {error === null ? null : (
        <Button label="Your topics" tone="quiet" onPress={() => router.replace("/")} />
      )}
    </Screen>
  );
}

function buildLabel(busy: boolean, retrying: boolean): string {
  if (busy) {
    return "Building your map…";
  }
  return retrying ? "Build it again" : "Build the map";
}

/**
 * One answer, shown as what it says, with the box behind a press.
 *
 * Three boxes down the screen would be the form again, and a review that looks
 * like the form is one nobody reads — the point of this screen is that the
 * answers can be taken in at a glance, and changed where one is wrong.
 */
function Field({
  label,
  value,
  empty,
  hint,
  multiline = false,
  maxLength,
  onChange,
}: {
  label: string;
  value: string;
  /** What the row says when the answer is blank. */
  empty: string;
  hint?: string;
  multiline?: boolean;
  maxLength: number;
  onChange: (next: string) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <View className="gap-2">
        <Input
          label={label}
          value={value}
          onChangeText={onChange}
          multiline={multiline}
          maxLength={maxLength}
          hint={hint}
          autoFocus
        />
        <Button label="Done" tone="secondary" onPress={() => setOpen(false)} />
      </View>
    );
  }

  const blank = value.trim() === "";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Change: ${label}`}
      onPress={() => setOpen(true)}
      className="gap-1 rounded-card border border-line bg-surface p-3"
    >
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="text-xs text-ink-faint">{label}</Text>
        <Text className="text-xs font-semibold text-accent">Change</Text>
      </View>
      <Text className={blank ? "text-sm text-ink-faint" : "text-sm text-ink"}>
        {blank ? empty : value}
      </Text>
    </Pressable>
  );
}

/**
 * One of the seven: what was picked, and the four options again behind a press.
 *
 * Reopened in place rather than by walking back through the stepper, because
 * changing one answer is the reason somebody is on this screen and the other six
 * are not what they came to change.
 */
function Choice({
  question,
  answers,
  onAnswers,
}: {
  question: MapQuestionT;
  answers: readonly MapAnswerT[];
  onAnswers: (answers: MapAnswerT[]) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const indexes = new Set(pickedIndexes(answers, question.kind));

  return (
    <View className="gap-2 rounded-card border border-line bg-surface p-3">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Change your answer: ${question.question}`}
        onPress={() => setOpen(!open)}
        className="gap-1"
      >
        <AnsweredSummary question={question} answers={answers} action={open ? "Done" : "Change"} />
      </Pressable>

      {open ? (
        <View className="gap-3">
          <Text className="text-sm text-ink-soft">Pick as many as you want, or none.</Text>
          {question.options.map((option, index) => (
            <MapQuestionOption
              key={`${question.kind}-${index}`}
              option={option}
              selected={indexes.has(index)}
              onPress={() => onAnswers(toggleAnswer(answers, question.kind, index))}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
