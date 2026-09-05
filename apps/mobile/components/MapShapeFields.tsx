import { Text, View } from "react-native";
import type { ReactElement } from "react";
import { useSeedMapInstructions } from "@interestled/api";
import {
  DAY_OPTIONS,
  MAP_DEPTH_COPY,
  MAP_DEPTH_OPTIONS,
  MAP_LEVELS_COPY,
  MAP_LEVELS_OPTIONS,
  MINUTES_OPTIONS,
} from "@interestled/ui";
import {
  MAIN_HEADINGS_MAX,
  MAIN_HEADINGS_MIN,
  MAP_INSTRUCTIONS_MAX,
  MapLevels,
  SUB_HEADINGS_MAX,
  SUB_HEADINGS_MIN,
} from "@interestled/schemas";
import type { MapDepth, MapShapeT, MinutesPerDay, StudyDays } from "@interestled/schemas";
import { ChipRow } from "./ChipRow";
import { SeededInstructions } from "./SeededInstructions";

/**
 * What the second count is counting, which the level above decides: nodes under
 * a heading, or headings under an area. One label that says "and under each
 * one?" for both is the screen declining to say what is being chosen.
 */
function underEachLabel(levels: MapLevels): string {
  return levels === MapLevels.Three
    ? "And how many sub-headings under each?"
    : "And how many nodes under each?";
}

/** Every count between the two bounds, which is few enough to be a row of chips. */
function counts(min: number, max: number): { value: string; label: string }[] {
  return Array.from({ length: max - min + 1 }, (_value, index) => ({
    value: String(min + index),
    label: String(min + index),
  }));
}

/**
 * How the map should be shaped, and the instruction lines those settings seed.
 *
 * The lines are the point of the screen. A pair of number chips is a setting
 * somebody has to imagine the effect of; "Use 5 main headings, and 4
 * sub-headings under each one" is a sentence they can disagree with, and the
 * sentence is what the model is actually sent. So the chips write the lines, and
 * the moment the learner edits the lines the chips stop touching them — the
 * settings can only say the things somebody thought to make a setting for, and
 * whatever they wrote instead is worth more than the seed.
 *
 * Same component on the create screen and in the rebuild sheet, because a
 * rebuild is the same decision made again with the last answers in the box.
 */
export function MapShapeFields({
  shape,
  onShape,
  instructions,
  onInstructions,
  instructionsEdited,
  onInstructionsEdited,
}: {
  shape: MapShapeT;
  onShape: (shape: MapShapeT) => void;
  instructions: string;
  onInstructions: (instructions: string) => void;
  /**
   * Whether the lines below were written by the learner rather than seeded.
   * Both optional, for the caller that keeps its fields for as long as the
   * screen is open and has nothing to remember — see SeededInstructions.
   */
  instructionsEdited?: boolean;
  onInstructionsEdited?: () => void;
}): ReactElement {
  const seed = useSeedMapInstructions();
  const set = (patch: Partial<MapShapeT>): void => onShape({ ...shape, ...patch });

  return (
    <View className="gap-5">
      {/* First, because it is what the two counts below mean: at two levels the
          second one is the nodes under a heading, and at three it is the
          headings under a heading. */}
      <View className="gap-2">
        <Text className="text-sm font-medium text-ink-soft">How many levels?</Text>
        <ChipRow
          options={MAP_LEVELS_OPTIONS}
          selected={String(shape.levels)}
          onSelect={(value) => set({ levels: Number(value) as MapLevels })}
        />
        <Text className="text-sm text-ink-soft">{MAP_LEVELS_COPY[shape.levels].body}</Text>
      </View>

      <View className="gap-2">
        <Text className="text-sm font-medium text-ink-soft">How many main headings?</Text>
        <ChipRow
          options={counts(MAIN_HEADINGS_MIN, MAIN_HEADINGS_MAX)}
          selected={String(shape.mainHeadings)}
          onSelect={(value) => set({ mainHeadings: Number(value) })}
        />
      </View>

      <View className="gap-2">
        <Text className="text-sm font-medium text-ink-soft">{underEachLabel(shape.levels)}</Text>
        <ChipRow
          options={counts(SUB_HEADINGS_MIN, SUB_HEADINGS_MAX)}
          selected={String(shape.subHeadings)}
          onSelect={(value) => set({ subHeadings: Number(value) })}
        />
      </View>

      <View className="gap-2">
        <Text className="text-sm font-medium text-ink-soft">How long a sitting?</Text>
        <ChipRow
          options={MINUTES_OPTIONS}
          selected={String(shape.minutesPerDay)}
          onSelect={(value) => set({ minutesPerDay: Number(value) as MinutesPerDay })}
        />
      </View>

      <View className="gap-2">
        <Text className="text-sm font-medium text-ink-soft">Over how long?</Text>
        <ChipRow
          options={DAY_OPTIONS}
          selected={String(shape.days)}
          onSelect={(value) => set({ days: Number(value) as StudyDays })}
        />
      </View>

      <View className="gap-2">
        <Text className="text-sm font-medium text-ink-soft">How far into it?</Text>
        <ChipRow
          options={MAP_DEPTH_OPTIONS}
          selected={String(shape.depth)}
          onSelect={(value) => set({ depth: Number(value) as MapDepth })}
        />
        <Text className="text-sm text-ink-soft">{MAP_DEPTH_COPY[shape.depth].body}</Text>
      </View>

      <SeededInstructions
        input={shape}
        seed={(next, onSeeded) => seed.mutate(next, { onSuccess: onSeeded })}
        value={instructions}
        onChange={onInstructions}
        edited={instructionsEdited}
        onEdited={onInstructionsEdited}
        label="What the map will be built to"
        hint="These are the words the model is given. Change any of them."
        maxLength={MAP_INSTRUCTIONS_MAX}
      />
    </View>
  );
}
