import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import {
  MAP_INSTRUCTIONS_MAX,
  MapAnswers,
  MapPlanView,
  MapShapeInput,
} from "@interestled/schemas";
import type { TopicCreateInputT } from "@interestled/schemas";
import { MAP_DRAFT_KEY } from "./storage";

/**
 * Everything a map is about to be built from, held outside any one screen.
 *
 * The create form, the seven choices and the review screen are three screens
 * answering one question, and the answers have to outlive all three: a build is
 * a model call that takes half a minute and can fail — a key, a quota, a reply
 * the schema refused twice, or CloudFront giving up at 60s on a request the
 * server is still serving. Every one of those used to land on a sheet whose
 * state went with it, so the learner's way out was to answer seven questions
 * again for a map they had already asked for.
 *
 * So it is a store rather than component state, and it is written to disk: a
 * draft survives navigating away, the app being put down, and the launch after
 * that. It is cleared when the map is built, and on sign-out — it holds what
 * somebody typed, and the next person on the device must not be handed it.
 */
export const MapDraft = z.object({
  title: z.string().max(120).default(""),
  goal: z.string().max(600).default(""),
  level: z.string().max(600).default(""),
  shape: MapShapeInput.default({}),
  mapInstructions: z.string().max(MAP_INSTRUCTIONS_MAX).default(""),
  /**
   * Whether the lines above were written by the learner or seeded from the
   * shape. The box seeds itself until somebody types in it, and that fact
   * cannot be recovered from the text — so it travels with the draft rather
   * than being guessed from "the box is not empty", which is true of a seed as
   * well and would leave the chips writing lines nobody reads again.
   */
  instructionsEdited: z.boolean().default(false),
  /** The seven questions as they were asked, since an answer is an index into them. */
  plan: MapPlanView.nullable().default(null),
  answers: MapAnswers.default([]),
  /**
   * The topic a failed build already created, out of the 502 that reported it.
   * The next press rebuilds that topic rather than making a second one — the
   * plan is linked to it, so nothing is lost by reusing it either.
   */
  topicSlug: z.string().nullable().default(null),
});

export type MapDraftT = z.infer<typeof MapDraft>;

/** A draft with nothing answered: the defaults, in one place. */
export const EMPTY_DRAFT: MapDraftT = MapDraft.parse({});

/** What the create call sends, out of what the three screens collected. */
export function topicCreateInput(draft: MapDraftT): TopicCreateInputT {
  return {
    title: draft.title.trim(),
    goal: draft.goal.trim(),
    level: draft.level.trim(),
    ...draft.shape,
    mapInstructions: draft.mapInstructions.trim(),
    planId: draft.plan?.planId,
    answers: draft.answers,
  };
}

let draft: MapDraftT = EMPTY_DRAFT;
/** Set once anything has been typed or read back, so a late read cannot clobber it. */
let settled = false;
const listeners = new Set<() => void>();

/**
 * At most one write per interval, and always ending on the current draft. A
 * write per keystroke is what a box of goals would otherwise be.
 */
const WRITE_EVERY_MS = 500;
let writing: ReturnType<typeof setTimeout> | null = null;

function save(): void {
  if (writing !== null) {
    return;
  }
  writing = setTimeout(() => {
    writing = null;
    void AsyncStorage.setItem(MAP_DRAFT_KEY, JSON.stringify(draft));
  }, WRITE_EVERY_MS);
}

function publish(next: MapDraftT): void {
  draft = next;
  for (const listener of listeners) {
    listener();
  }
}

/** Change part of the draft. Everything else is left as it was. */
export function setMapDraft(patch: Partial<MapDraftT>): void {
  settled = true;
  publish({ ...draft, ...patch });
  save();
}

/** Nothing left to build: the map was made, or somebody signed out. */
export function clearMapDraft(): void {
  settled = true;
  publish(EMPTY_DRAFT);
  // Removed rather than left to the throttled write above, so a sign-out that
  // is the last thing the app does still leaves nothing behind.
  void AsyncStorage.removeItem(MAP_DRAFT_KEY);
}

/**
 * Read back on first import rather than from a screen's effect: the review
 * screen can be opened cold, from a link or a reload, and a hook that hydrated
 * on mount would paint an empty form first and fill it in afterwards.
 *
 * A draft written by an older build reads as absent, which costs the learner
 * the form they were filling in and nothing else.
 */
void (async () => {
  const stored = await AsyncStorage.getItem(MAP_DRAFT_KEY);
  if (stored === null || settled) {
    return;
  }
  try {
    const parsed = MapDraft.safeParse(JSON.parse(stored));
    if (parsed.success && !settled) {
      settled = true;
      publish(parsed.data);
    }
  } catch {
    // Unreadable JSON is a draft that no longer exists, not a crash on launch.
  }
})();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The draft, re-rendering the screen when any of it changes. */
export function useMapDraft(): MapDraftT {
  return useSyncExternalStore(
    subscribe,
    () => draft,
    () => draft,
  );
}
