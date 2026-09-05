import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { ReactElement } from "react";
import { useProfile, useUpdateProfile } from "@interestled/api";
import { Button, ErrorState, Screen, Input, LoadingContent } from "@interestled/ui";
import { LEARNING_STYLES, LEARNING_STYLE_LABELS } from "@interestled/schemas";
import type { LearningStyle, ProfileT } from "@interestled/schemas";
import { useAuth } from "../lib/auth";
import { messageOf } from "../lib/errors";
import { useHardwareBack } from "../lib/nav";
import { ChipMultiRow } from "../components/ChipRow";

const STYLE_OPTIONS = LEARNING_STYLES.map((value) => ({
  value,
  label: LEARNING_STYLE_LABELS[value],
}));

/** Digits only, and empty means "not said" rather than zero. */
function parseAge(text: string): number | null {
  const digits = text.replace(/[^0-9]/g, "");
  return digits === "" ? null : Number(digits);
}

/**
 * The profile. Answered once, read by every generation call after that — which
 * is the whole reason it is worth a screen of its own rather than three more
 * questions on the topic form, where they would be asked again per topic.
 *
 * Nothing here is required and nothing gates anything: a learner who never
 * opens this screen gets the same product, written for a capable adult.
 */
export default function ProfileScreen(): ReactElement {
  // The bar for this screen is set in the navigator, so the hardware button is
  // wired here — both of them go to the topics list.
  useHardwareBack("/");
  const { user } = useAuth();
  const profile = useProfile();
  const save = useUpdateProfile();
  const [age, setAge] = useState("");
  const [background, setBackground] = useState("");
  const [styles, setStyles] = useState<LearningStyle[]>([]);

  // Seeded once the server answers. The form is the edit buffer from then on,
  // so a refetch mid-edit cannot overwrite what is being typed.
  useEffect(() => {
    const loaded: ProfileT | undefined = profile.data;
    if (loaded === undefined) {
      return;
    }
    setAge(loaded.age === null ? "" : String(loaded.age));
    setBackground(loaded.background);
    setStyles([...loaded.learningStyles]);
  }, [profile.data]);

  if (profile.isPending) {
    return <LoadingContent label="Opening your profile…" lines={5} />;
  }
  if (profile.isError) {
    return (
      <View className="p-4">
        <ErrorState message={messageOf(profile.error)} />
      </View>
    );
  }

  const toggle = (value: LearningStyle): void => {
    setStyles((current) =>
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
    );
  };

  return (
    <Screen contentContainerClassName="gap-5 p-4">
      {/* First, because it is the one thing on this screen that other people
          see. Nothing else here is public — the answers below are read by the
          model and by nobody else. */}
      {user === null ? null : (
        <View className="gap-1 rounded-card border border-line bg-surface p-3">
          <Text className="text-xs text-ink-faint">Your username</Text>
          <Text className="text-base font-semibold text-ink">{user.username}</Text>
          <Text className="text-xs text-ink-faint">
            Anyone with this can read the maps and cards you have made. What you have finished, and
            everything on this screen, stays yours.
          </Text>
        </View>
      )}

      <Text className="text-sm text-ink-soft">
        Answered once. Every map and card after this is written to it.
      </Text>

      <Input
        label="Age"
        value={age}
        onChangeText={(next) => setAge(next.replace(/[^0-9]/g, ""))}
        placeholder="34"
        maxLength={3}
        hint="Sets the vocabulary and which comparisons land. Leave it blank to skip."
      />

      <Input
        label="About yourself — what do you already know? Two or three points."
        value={background}
        onChangeText={setBackground}
        multiline
        maxLength={600}
        placeholder={"Backend engineer, mostly Python\nComfortable with SQL and Linux\nNo maths past school"}
        hint="Anything here can be skipped in a map and used for comparisons."
      />

      <View className="gap-2">
        <Text className="text-sm font-medium text-ink-soft">
          How do you want things explained?
        </Text>
        <ChipMultiRow options={STYLE_OPTIONS} selected={styles} onToggle={toggle} />
        <Text className="text-xs text-ink-faint">Pick any number, or none.</Text>
      </View>

      {save.isError ? <ErrorState message={messageOf(save.error)} /> : null}

      <Button
        label={save.isPending ? "Saving…" : "Save"}
        busy={save.isPending}
        onPress={() =>
          save.mutate({ age: parseAge(age), background, learningStyles: styles })
        }
      />
      {save.isSuccess && !save.isPending ? (
        <Text className="text-center text-sm text-ink-faint">
          Saved. It applies to the next map or card generated.
        </Text>
      ) : null}
    </Screen>
  );
}
