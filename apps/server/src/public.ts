import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  DrillKindSchema,
  MapAnswers,
  MapQuestionSet,
  PublicCard,
  PublicDrill,
  PublicTopic,
  PublicTopicDetail,
  contentSettingsOf,
} from "@interestled/schemas";
import type { LearningNodeT, PublicMapPlanT, TopicT } from "@interestled/schemas";
import { masteryDrill } from "@interestled/domain";
import type { Db } from "./db";
import { NotFoundError } from "./errors";
import { effectiveContentInstructions, effectiveMapInstructions } from "./llm";
import { newestCard } from "./learning";
import { readNarration } from "./narration";
import type { ObjectStore } from "./storage";
import { toCardQuestion, toDrill, toNode, toTopic } from "./rows";

/**
 * Everything anyone may read, addressed by the username of whoever made it.
 *
 * **What was generated is public; what the learner did with it is not.** A map,
 * the seven answers it was built from, the settings and instruction lines it was
 * written to, the cards, the drills and the questions asked on a card are all
 * model output somebody paid for once, and there is nothing to be gained by
 * hiding them. Which nodes they have finished, what they are due to review and
 * where they left off is the record of a person studying, and that stays theirs
 * — so no route here returns a status, a progress count, a resume point or a
 * profile, and `PublicNode` has no field to put a status in.
 *
 * Two things hold the rest of the line:
 *
 * - **It cannot generate.** This router is handed a database and the object
 *   store and no LLM provider at all, so a card that has never been written
 *   answers 404 rather than costing its owner a model call. That is the whole
 *   reason the reads here are their own routes rather than the authenticated
 *   ones with the ownership check removed: those write on a miss.
 * - **It cannot write.** Nothing here is anything but a read — no status moves,
 *   no depth is remembered, and opening somebody's card does not mark it seen
 *   for them.
 *
 * There is deliberately no way to list usernames. A name is something you are
 * given or told, not something to walk.
 */
export function publicRouter(db: Db, objects: () => ObjectStore): Hono {
  const router = new Hono();

  /** Whose work this is. A name nobody holds is a 404, like every other miss. */
  const owner = async (username: string): Promise<{ id: string; username: string }> => {
    const row = await db.user.findUnique({
      where: { username },
      select: { id: true, username: true },
    });
    if (row === null) {
      throw new NotFoundError("No account with that username");
    }
    return row;
  };

  /** One topic of theirs, by the slug in its own URL. */
  const topicOf = async (username: string, slug: string): Promise<TopicT> => {
    const { id } = await owner(username);
    const row = await db.topic.findFirst({ where: { userId: id, slug } });
    if (row === null) {
      throw new NotFoundError("Topic not found");
    }
    return toTopic(row);
  };

  /**
   * One node of theirs. Scoped to the username in the path as well as to the id:
   * the id alone would be enough to find the row, but then a public URL would
   * only appear to be about the person it names, and one of somebody else's node
   * ids would answer under any name at all.
   */
  const nodeOf = async (
    username: string,
    nodeId: string,
  ): Promise<{ userId: string; username: string; node: LearningNodeT; topic: TopicT }> => {
    const account = await owner(username);
    const row = await db.learningNode.findFirst({
      where: { id: nodeId, topic: { userId: account.id } },
      include: { prerequisites: { select: { prerequisiteId: true } }, topic: true },
    });
    if (row === null) {
      throw new NotFoundError("Node not found");
    }
    return {
      userId: account.id,
      username: account.username,
      node: toNode(row),
      topic: toTopic(row.topic),
    };
  };

  /**
   * Everything they own, newest first. The topics themselves and nothing about
   * how far through them anyone is.
   */
  router.get("/:username/topics", async (c) => {
    const { id } = await owner(c.req.param("username"));
    const rows = await db.topic.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" } });
    return c.json(rows.map((row) => PublicTopic.parse(toTopic(row))));

  });

  /**
   * One topic: the map, and everything the map was built from.
   *
   * The instruction lines are answered as the model actually received them
   * rather than as they are stored. Both columns hold "" until the learner
   * writes in them, and the seed rendered from the settings is what the
   * generation saw — so a reader given the stored value would be shown an
   * emptiness that stands for a page of instructions.
   */
  router.get("/:username/topics/:slug", async (c) => {
    const username = c.req.param("username");
    const topic = await topicOf(username, c.req.param("slug"));
    const [rows, plan] = await Promise.all([
      db.learningNode.findMany({
        where: { topicId: topic.id },
        include: { prerequisites: { select: { prerequisiteId: true } } },
        orderBy: { orderIndex: "asc" },
      }),
      planFor(db, topic.id),
    ]);
    // The whole response goes through its schema on the way out, not just the
    // nodes: that is what makes "a public route cannot leak a status" a fact
    // about the code rather than a note in a comment, and it holds for any
    // field added to a topic or a node later.
    return c.json(
      PublicTopicDetail.parse({
        username,
        topic,
        nodes: rows.map(toNode),
        plan,
        instructions: {
          map: effectiveMapInstructions(topic),
          content: effectiveContentInstructions(contentSettingsOf(topic)),
        },
      }),
    );
  });

  /**
   * The card, as it was written for its owner, and the settings it was written
   * to. Never written here: a node nobody has opened has no card, and answering
   * one would mean a visitor could spend somebody else's model budget by
   * walking their map.
   */
  router.get("/:username/nodes/:id/card", async (c) => {
    const { node } = await nodeOf(c.req.param("username"), c.req.param("id"));
    const card = await newestCard(db, node.id);
    if (card === null) {
      throw new NotFoundError("Nothing has been written for this node yet");
    }
    return c.json(
      PublicCard.parse({ node, settings: card.settings, content: card.content }),
    );
  });

  /** The drill for that node, if one has been generated. Never generated here. */
  router.get(
    "/:username/nodes/:id/drill",
    zValidator("query", z.object({ kind: DrillKindSchema.optional() })),
    async (c) => {
      const { node } = await nodeOf(c.req.param("username"), c.req.param("id"));
      const kind = c.req.valid("query").kind ?? masteryDrill(node.archetype);
      const existing = await db.drill.findFirst({ where: { nodeId: node.id, kind } });
      if (existing === null) {
        throw new NotFoundError("No drill has been written for this node yet");
      }
      return c.json(PublicDrill.parse({ node, drill: toDrill(existing) }));
    },
  );

  /**
   * What was asked on this card and what came back, oldest first. The question
   * is the learner's, and the answer is a page of model output about the
   * subject — both are what this node ended up saying.
   */
  router.get("/:username/nodes/:id/questions", async (c) => {
    const { node } = await nodeOf(c.req.param("username"), c.req.param("id"));
    const rows = await db.cardQuestion.findMany({
      where: { nodeId: node.id },
      orderBy: { createdAt: "asc" },
    });
    return c.json(rows.map(toCardQuestion));
  });

  /**
   * The recording of that card, if one was made. The settings are not asked for
   * as they are on the authenticated route: there is no card on a reader's
   * screen to name, so this is the recording of the card this route would
   * answer with — the newest one the node has.
   */
  router.get("/:username/nodes/:id/audio", async (c) => {
    const { userId, username, node, topic } = await nodeOf(
      c.req.param("username"),
      c.req.param("id"),
    );
    const card = await newestCard(db, node.id);
    if (card === null) {
      return c.json({ audio: null });
    }
    const audio = await readNarration(db, objects, {
      userId,
      username,
      topic,
      node,
      settings: card.settings,
    });
    return c.json({ audio });
  });

  /**
   * Anything else under this prefix is a public path that does not exist, and
   * has to say so here: the authenticated sub-app is mounted on "/api" as well,
   * so without this a mistyped public URL would fall through to it and answer
   * 401 — which reads as "sign in and you could have this" for an address that
   * will never resolve.
   */
  router.all("*", () => {
    throw new NotFoundError("Not found");
  });

  return router;
}

/**
 * How far back to look for the plan a map was built from. More than one because
 * opening the rebuild sheet writes a plan and closing it again leaves that row
 * sitting on top of the one the build actually used.
 */
const PLANS_CONSIDERED = 5;

/**
 * The seven questions this topic's map was built from, and what was picked.
 *
 * safeParse rather than a throwing one: these rows can be months old and written
 * before MapQuestionKind last changed, and a topic whose plan no longer parses
 * is a topic that reads fine without one.
 */
async function planFor(db: Db, topicId: string): Promise<PublicMapPlanT | null> {
  const rows = await db.mapPlan.findMany({
    where: { topicId },
    orderBy: { createdAt: "desc" },
    take: PLANS_CONSIDERED,
  });
  for (const row of rows) {
    const questions = MapQuestionSet.safeParse(row.questions);
    const answers = MapAnswers.safeParse(row.answers);
    if (questions.success && answers.success) {
      return { questions: questions.data, answers: answers.data };
    }
  }
  return null;
}
