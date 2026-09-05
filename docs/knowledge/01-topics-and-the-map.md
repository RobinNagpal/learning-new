# Topics and the map

A topic is a subject somebody wants to learn. Its map is a tree of nodes:
headings, and under each heading the nodes a learner actually reads and drills —
two levels, or three for a subject wide enough that its main headings are areas.
The map is generated once from what the learner asked for, and is then theirs to
edit.

## What the learner does

1. Fills in a short form: title, goal, where they are now, and the shape of the
   map (how many levels, how many headings, minutes a day, for how many days,
   how deep).
2. Presses a button that asks the model for **seven questions**, each with four
   options, and picks from them. Every question is skippable.
3. Lands on the **review screen**, which holds all of that on one page with the
   build button under it — see below.
4. Gets the map, and lands on the topic screen with the whole tree on it.

After that the map can be corrected in place: rebuild one heading, move a node,
delete a node, or rebuild the whole thing.

## The seven questions

`POST /api/topics/questions` (a topic that does not exist yet) and
`POST /api/topics/:slug/questions` (a rebuild) generate them. The reply is stored
in `map_plans` and the row's id travels back with the answers, because an answer
is "the second option" and that means nothing beside a different four options.

The stepper (`apps/mobile/components/MapQuestions.tsx`) asks one question per
screen. It ends in a what-you-picked step on a rebuild, where there is nowhere
else to show one, and hands straight on to the review screen when a topic is
being created (`summarise`).

`MapQuestionKind` fixes seven slots in one order — `outline`, `breakdown`,
`known`, `recap`, `scope`, `examples`, `opening` — and `MapQuestionSet` refuses
anything else. Answers are keyed by kind, so a missing kind is a question nobody
was asked and a repeated one overwrites another.

An option is a **sample**, not a description: four candidate sets of headings
rather than "how should this be organised". Both the picked and the passed-over
options reach the prompt, with their samples, because the four were only ever
meaningful against each other.

Files: `packages/schemas/src/mapQuestions.ts`,
`apps/server/src/topics.ts` (`createPlan`, `resolveChoices`, `rebuildChoices`),
`apps/server/src/llm/prompts/map-questions.md`,
`apps/mobile/components/MapQuestions.tsx`,
`apps/mobile/components/MapQuestionOption.tsx` (one option, and the toggling,
shared by the stepper and the review screen).

## The draft, and the review screen

Everything between "I want to learn this" and the map lives in one draft
(`apps/mobile/lib/mapDraft.ts`): the three answers, the shape, the instruction
lines, the questions as they were asked, the picks, and — once a build has failed
— the topic it left behind. No screen in the flow holds any of it in component
state.

That is because building is the slow, expensive, occasionally failing part of the
product. It is a model call of half a minute; CloudFront gives up on the origin
at sixty seconds while the server carries on; the model can fail outright. Every
one of those used to land on a sheet whose state went with it, so the way out was
to answer seven questions again for a map that had already been asked for. The
draft is written to disk (throttled), so it survives that, a phone put down, and
the launch after it. It is cleared when a map is built, and on sign-out — it is
what somebody typed, and the next person on the device must not be handed it.

The review screen (`app/topic/new/review.tsx`) is what that makes possible: every
answer on one page, each changed in place, and the build button under them. It is
also where a failure lands, with everything still in it and one button to press
again.

**A failed build is retried as a rebuild, not as a second topic.** The topic row
is written before the map is generated, so a build that failed already made one —
which is why the 502 names it (`topicSlug` on `ApiError`) and the draft keeps it.
The next press goes to `POST /:slug/regenerate`, which also reuses the plan
already linked to that topic. Without it, three attempts leave three topics.

## The data model

```
topics
  slug              unique per user; every URL is built from it
  title, summary, goal, level
  archetype         set by the generated map, not by the form
  levels, mainHeadings, subHeadings, minutesPerDay, days, depth   the MapShape
  mapInstructions   "" means the seed rendered from the shape applies
  englishLevel, technicalDetail, format, paragraphLength, averageReadTime
  contentInstructions
  status            generating | ready | failed        error

learning_nodes
  parent_id         null at the top of the map
  path              every ancestor slug joined by "/"   UNIQUE(topic_id, path)
  title, claim, capability, minutes, archetype
  order_index       position among siblings, not within the topic
  status            NodeStatus
  card_instructions what the learner asked for this node's card

node_prerequisites  advisory edges only, never a gate
map_plans           the seven questions asked, and the answers given
```

`slug` and `depth` are derived from `path` in `toNode` rather than stored beside
it. A **branch** is a heading: it has children, no card, no drill and `minutes`
0. Being a branch is derived from the set (`isBranch`), never stored — deleting
a branch's last child turns it into a leaf.

Uniqueness is `UNIQUE(topic_id, path)` rather than `(parent_id, slug)` because
Postgres never treats two NULLs as equal, which would exempt every top-level
node from the constraint.

Files: `apps/server/prisma/schema.prisma`, `packages/schemas/src/nodes.ts`,
`packages/schemas/src/slugs.ts`, `packages/domain/src/tree.ts`.

## How many levels

`levels` is `MapLevels.Two` or `MapLevels.Three`, chosen on the same screen as
the heading counts, and it is what those counts mean:

| | Level 1 | Level 2 | Level 3 |
|---|---|---|---|
| Two | `mainHeadings` headings | `subHeadings` nodes under each | — |
| Three | `mainHeadings` areas | `subHeadings` headings under each | the nodes each of those needs |

At three levels the leaf count is the model's to judge, inside the same bounds,
against the time the instruction lines state — the learner's two counts are both
spent on headings by then.

The setting chooses two things together, a line apart: the block of the prompt
that says what shape to produce (`map-two-levels.md` or `map-three-levels.md`,
picked in `mapShapeBlock`) and the schema the reply is parsed by
(`GeneratedTwoLevelMap` or `GeneratedThreeLevelMap`, picked in `generateMap`).
Both are flattened to the same rows by `flattenTwoLevelMap` /
`flattenThreeLevelMap`, so nothing below the parse knows which it was.

Every count is bounded by what the generated-map schema will accept, and both
level counts are held to the same two pairs — `MAIN_HEADINGS_MIN/MAX` and
`SUB_HEADINGS_MIN/MAX`. A setting the parse would then refuse reaches the learner
as a failed generation rather than as the setting it was.

Files: `packages/schemas/src/topics.ts` (`MapLevels`, `MapShape`),
`packages/schemas/src/nodes.ts` (the generated shapes and the flatteners),
`apps/server/src/llm/prompts.ts`, `apps/mobile/components/MapShapeFields.tsx`.

## Building a map

`POST /api/topics` runs the whole thing in the request:

1. `assertWithinBudget` (see doc 5).
2. Resolve the answers against the stored plan.
3. Insert the topic row with `status: generating`, so a failure leaves something
   to retry rather than vanishing.
4. Link the plan to the topic — before the map is generated, so a failed build
   can fall back to the plan already answered.
5. `buildMap` → `generateMap` → `saveMap`. On failure the topic keeps
   `status: failed` and the message, and the route answers `502` with the slug.

`prepareNodes` in `apps/server/src/maps.ts` turns generated nodes into rows: an
id per generated key, a slug per title unique among its siblings, and a path
built from the parent's. **Slugs are allocated server-side, never by the model** —
uniqueness is a property of the set, and `uniqueSlug` also refuses
`RESERVED_SLUGS` so a node titled "Edit" cannot shadow the edit screen.
`insertNodes` inserts shallowest-first so a parent is committed before a child
references it.

Generation runs on `LlmTask.Map` — the reasoning model — because a bad cut of the
subject is wrong on every screen afterwards.

## Editing a map

All three edits answer with the **whole** `TopicDetail` (`loadTopicDetail`), so
the client holds the new truth rather than a fragment plus a refetch.

| Route | Does |
|---|---|
| `POST /:slug/regenerate` | Rebuild everything. Deletes every node first — cards, drills and review items cascade. Asks the seven questions again. |
| `POST /:slug/nodes/:nodeId/regenerate` | Rebuild what sits under **one heading**, leaving the rest of the map and every status on it untouched. Refuses a leaf. Does not re-ask the questions. |
| `PUT /:slug/nodes/:nodeId/move` | Swap two rows' `order_index` at one level. A no-op at the end of a level rather than an error. |
| `DELETE /:slug/nodes/:nodeId` | Delete the node and everything under it. |

Rebuilding one group is the load-bearing one: "the map is nearly right" is the
normal case after reading it, and an edit mode whose only answer is regenerating
everything throws away every node already verified.

What that rebuild asks for is read off the map rather than off `topic.levels`:
`subtreeShapeOf` answers `Sections` for a group whose children are themselves
groups — the top of a three-level map — and `Leaves` for anything one level above
the nodes. The topic's setting describes the last whole map that was built, and
this group may be the one part of it that was left alone.

`PUT /:slug/info` and `PUT /:slug/content-settings` change what the topic is and
how it is written. **Neither regenerates anything** — see doc 2.

## Reading order and URLs

`order_index` ranks siblings, so sorting the flat list by it interleaves the
levels. `inMapOrder` walks the tree instead, and everything that needs a
sequence — the outline sent to the card prompt, `nextNode`, `composeSession` —
goes through it. `leafNodes` drops the headings, and every count and capability
is drawn from those (`summarise`).

```
/topic/<topic-slug>                          the map
/topic/<topic-slug>/<node-path>              a heading, or a card
/topic/<topic-slug>/<node-path>/drill        its drill
/topic/<topic-slug>/edit{,/map,/goals,/content}
```

One file resolves the first three: `apps/mobile/app/topic/[topic]/[...path].tsx`.
Whether an address is a heading, a card or a drill is a fact about the node the
map already carries.

## What must not break

- **Nothing on the map locks.** Prerequisites are a note with a link.
- **A branch is never counted as progress.** A total the learner cannot reach is
  the lying map ideal 1 forbids.
- **Rebuilding one group leaves the rest alone.**

See CLAUDE.md, *The map is a tree, addressed by slug*.
