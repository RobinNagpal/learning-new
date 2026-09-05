import { z } from "zod";
import { CardContent, CardSettings } from "./cards";
import { Drill } from "./drills";
import { MapAnswers, MapQuestionSet } from "./mapQuestions";
import { LearningNode } from "./nodes";
import { Username } from "./slugs";
import { Topic } from "./topics";

/**
 * What anyone may read, without an account and without being anybody.
 *
 * The rule these shapes exist to hold: **what was generated is public, and what
 * the learner did with it is not.** A map, the answers it was built from, the
 * cards, the drills and the questions asked on a card are all model output
 * somebody paid for once and there is no reason to hide — but which nodes they
 * have finished, what they are due to review and where they left off is a record
 * of a person studying, and that stays theirs.
 *
 * The types are what enforce it rather than a promise in a handler: a public
 * node has no `status` field to leak, so a route that reached for one would not
 * compile.
 */

/** A node as anyone may see it: the map's own content, with no status on it. */
export const PublicNode = LearningNode.omit({ status: true });

/** The topic itself. Its owner's id is dropped: it says nothing and is an id. */
export const PublicTopic = Topic.omit({ userId: true });

/**
 * The seven choices as they were asked, and which options were picked. Sent
 * whole rather than as the picks alone, because an answer is an index and means
 * nothing beside a different four options — the same reason the server stores
 * the questions rather than regenerating them.
 */
export const PublicMapPlan = z.object({
  questions: MapQuestionSet,
  answers: MapAnswers,
});

/**
 * Everything one topic was built from and everything it holds, in one answer:
 * the settings, the lines the model was given, the choices, and the map.
 */
export const PublicTopicDetail = z.object({
  username: Username,
  topic: PublicTopic,
  nodes: z.array(PublicNode),
  /** Null for a topic built before the seven questions existed, or without them. */
  plan: PublicMapPlan.nullable(),
  /**
   * What the model was actually given, which is not always what is stored: both
   * columns are "" until the learner writes in them, and the seed rendered from
   * the settings is what the generation saw. Answered here so a reader gets the
   * instructions rather than the emptiness that stands for them.
   */
  instructions: z.object({ map: z.string(), content: z.string() }),
});

/** One card as it was written, and the settings it was written to. */
export const PublicCard = z.object({
  node: PublicNode,
  settings: CardSettings,
  content: CardContent,
});

/** One drill, as generated for that node. */
export const PublicDrill = z.object({ node: PublicNode, drill: Drill });

export type PublicNodeT = z.infer<typeof PublicNode>;
export type PublicTopicT = z.infer<typeof PublicTopic>;
export type PublicMapPlanT = z.infer<typeof PublicMapPlan>;
export type PublicTopicDetailT = z.infer<typeof PublicTopicDetail>;
export type PublicCardT = z.infer<typeof PublicCard>;
export type PublicDrillT = z.infer<typeof PublicDrill>;
