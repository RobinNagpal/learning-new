# Interest Led — Working Agreements

The product is the interface: an LLM can generate any explanation on demand, so
what is scarce is showing the right thing in the right order and making it stay.
The design that this code implements is in [docs/ux/README.md](docs/ux/README.md),
and the constraints it must satisfy are in
[docs/ux/adhd-learning-guidelines.md](docs/ux/adhd-learning-guidelines.md).

## Start here: the knowledge base

**[docs/knowledge/](docs/knowledge/README.md) describes every feature of the
product and how it is built.** One document per area, each saying what the
learner sees, what happens when they use it, and which files to open.

| Document | Covers |
|---|---|
| [1. Topics and the map](docs/knowledge/01-topics-and-the-map.md) | Creating a topic, the seven questions, the node tree, editing and rebuilding a map |
| [2. Cards and writing settings](docs/knowledge/02-cards-and-writing-settings.md) | The concept card, its slots, the cache, the controls under it, questions asked on it |
| [3. Drills, progress and review](docs/knowledge/03-drills-progress-and-review.md) | The status ladder, grading, spaced review, study sessions |
| [4. Reading a card aloud](docs/knowledge/04-reading-a-card-aloud.md) | The play button, narration scripts, the voice a topic is read in, speech synthesis, the audio bucket |
| [5. Accounts, ownership and budgets](docs/knowledge/05-accounts-ownership-and-budgets.md) | Registration, sessions, usernames, what is public and what is not, every generation ceiling |
| [6. LLM providers and prompts](docs/knowledge/06-llm-providers-and-prompts.md) | Which model answers which call, structured generation, the prompt files |
| [7. The app shell and caching](docs/knowledge/07-the-app-shell-and-caching.md) | Routing, the query cache and what is persisted, the component set |

### Three rules about it, and they matter more than most of what follows

**Read the relevant document before starting any task.** Not after getting
stuck, and not instead of reading the code — before opening the first file.
Almost everything in this codebase that looks like it could be simplified is
load-bearing, and the knowledge base is where the shape of each feature is
written down in one place. Ten minutes there is what stops a change that
compiles, passes the tests, and quietly breaks a rule the product rests on. If
the area you are about to touch has no document, read the nearest one and the
rest of this file.

**Update it in the same change that makes it wrong.** A knowledge base nobody
trusts is worse than none, because it is read as current and is not. So:

- Adding a feature means adding its document, and its row both in the table above
  and in [docs/knowledge/README.md](docs/knowledge/README.md).
- Changing how something works means editing the document that describes it, in
  the same commit — not a follow-up.
- Removing something means removing what says it exists.
- The documents name files, routes, columns and constants. When you rename one,
  `grep docs/knowledge` for the old name before you finish.

**Keep it short, and only write down what is actually worth knowing.** These
documents are read before every task, so every paragraph is a cost paid again
each time. The test for a sentence is whether somebody would get the change
wrong without it:

- **Write the decisions and the traps**: why something is the way it is, what
  breaks if it is changed, the failure that is invisible until a learner hits it.
  Those are what cannot be recovered by reading the code.
- **Do not restate the code.** A list of a schema's fields, a signature, or a
  route's parameters goes stale the week it is written and was already readable
  where it lives. Name the file and say what to look for instead.
- **One place per fact.** If it is already in another document, or in this file,
  link to it rather than saying it again in different words — two copies drift,
  and the reader cannot tell which is current.
- **Prefer cutting to adding.** A new subsection on an existing document usually
  means two paragraphs somewhere else are now redundant; delete them. If a
  document has grown past what somebody will read before starting, it is too
  long, whatever is in it.
- **No summaries, no restating the point at the end, no filler.** The prose rules
  for prompts further down apply here as well.

The same applies to this file and to the coverage table in
[docs/ux/README.md](docs/ux/README.md): if you add a feature, add its row.

## Git identity

Always commit as the **robinnagpal.tiet@gmail.com** GitHub account
([github.com/RobinNagpal](https://github.com/RobinNagpal)) — never the work account.

```sh
git config user.name "Robin Nagpal"
git config user.email "robinnagpal.tiet@gmail.com"
```

Check `git config user.email` before the first commit in a session.

## Types

Use strict types everywhere. Nearly all code is TypeScript, with **no `any` and no
`unknown`** leaking into application code.

- Model the real shape instead of escaping the type system — no `any`, no `unknown`,
  and no `as` casts standing in for either. Parse with the schema instead: an
  unrecognised value must fail loudly rather than flow through.
- **Use an `enum` wherever a value comes from a fixed set** — statuses, kinds,
  archetypes, providers. Never pass bare strings. Pair the enum with `z.nativeEnum(…)`
  so the same set validates at every boundary.
- Types come from `packages/schemas` (Zod schemas + inferred types) — the single
  source of truth. Infer from a schema rather than hand-writing a parallel interface.
- `tsconfig` strict mode stays on. `pnpm typecheck` must pass clean across every
  package, and `pnpm test` and `pnpm lint` gate the deploy — see Deployment below.

## Database naming

**Table names are plural `snake_case`; column names are `snake_case`.** Postgres folds
unquoted identifiers to lower case, so a `ConceptCard` table would have to be written
`"ConceptCard"` in every hand-written query; snake_case never needs quoting.

Prisma keeps its own conventions — models stay singular `PascalCase`, fields stay
`camelCase` — and `@@map` / `@map` are the only place the two meet:

```prisma
model ConceptCard {
  nodeId String @map("node_id")

  @@map("concept_cards")
}
```

- Add a plural `@@map` to every new model, and `@map` to every field whose name is
  not already a single lower-case word.
- **Two new NOT NULL columns need a default for the deploy gap.** Migrations run from
  the runner before the new bundle ships, so for a few seconds the old code is still
  inserting rows that name none of the new columns. `topics.slug` and
  `learning_nodes.path` therefore default to `md5(random()::text)` rather than `''`: an
  empty slug fails the `Slug` schema on the very next read, and two of them collide on
  the unique index. Those defaults are for the gap only — drop them in the next schema
  change.
- **Renames need hand-written migrations.** `prisma migrate dev` cannot tell a rename
  from a drop-and-recreate, so it generates `DROP TABLE` + `CREATE TABLE` and destroys
  the rows. Write `ALTER TABLE … RENAME` by hand, and rename the constraints and
  indexes too (`…_pkey`, `…_key`, `…_fkey`) so Prisma's expected names still match.
- Verify a hand-written migration by applying it to a throwaway database and running
  `prisma migrate diff --from-url <that db> --to-schema-datamodel prisma/schema.prisma
  --script`. It must report an empty migration. Getting this wrong is expensive here:
  migrations are applied automatically on every push to `main`.

### No database enums

**Enums live in TypeScript only; the database column is a plain string.**
`NodeStatus` is a TS enum in `packages/schemas`, and `learning_nodes.status` is `TEXT`.
Adding a status is a one-line code change with no migration. `NodeStatusSchema`
is what guarantees the string is valid — parse at every boundary that reads the column.

Do not add `enum` blocks to `schema.prisma`.

## The map is a tree, addressed by slug

`learning_nodes` has a `parent_id` and a `path`, and those two carry the whole
structure:

- **A branch is a heading.** No card, no drill, `minutes` 0, and nothing counts it as
  progress. `summarise`, `composeSession` and `nextNode` all run through `leafNodes`
  first; counting branches gives a total the learner can never reach, which is the
  lying map ideal 1 forbids. `isBranch` is derived from the set rather than stored,
  because deleting a branch's last child turns it into a leaf and a stored flag would
  be a second fact about the same thing.
- **`path` is every ancestor slug joined by `/`**, and it is what URLs carry:
  `/topic/<topic-slug>/<node-path>` and `.../drill`. `slug` and `depth` are derived
  from it in `toNode` rather than stored beside it — two columns saying the same thing
  is two chances for an edit to leave them disagreeing.
- **Uniqueness is `UNIQUE(topic_id, path)`, not `(parent_id, slug)`.** Postgres never
  treats two NULLs as equal, so a constraint naming `parent_id` would exempt every
  top-level node from itself. Siblings share a parent path, so the two say the same
  thing and only one of them can be enforced.
- **Slugs are allocated server-side, never by the model.** `uniqueSlug` in
  `packages/schemas` numbers repeats and refuses `RESERVED_SLUGS` — a node titled
  "Edit" would otherwise sit at `/topic/x/edit` and shadow the edit screen.
- **`orderIndex` ranks siblings, not the topic.** Moving a node swaps exactly two rows
  at one level. Reading order comes from `inMapOrder`, which walks the tree; sorting
  the flat list by `orderIndex` interleaves the levels.

**A map is two levels or three, and the rest of its shape is settings.** `MapShape` —
`levels`, `mainHeadings`, `subHeadings`, `minutesPerDay`, `days`, `depth` — replaced
`TimeBudget`, which was answering the size question more vaguely and in a second place.
The heading counts say the shape, minutes a day times days says the size, and depth says
how far into the subject it goes. The counts are bounded by the generated-map schema's
own bounds, because a setting the parse then refuses reaches the learner as a failed
generation rather than as a setting.

**`levels` is what the two counts are read against.** At two they are headings and the
nodes under each; at three they are areas and the headings under each, and how many
nodes a group needs is left to the time budget. Both level counts are held to the same
two pairs of bounds, so changing the number of levels can never turn a count somebody
already chose into a reply the parse refuses. The setting picks the prompt block and the
schema the reply is parsed by in the same breath (`mapShapeBlock`, `generateMap`) —
asking for one shape and parsing the other is a generation that fails every attempt. A
group rebuild does not read it at all: `subtreeShapeOf` asks what hangs under that group
today, because the group at the top of a three-level map needs groups back and the
topic's setting is about the last whole map that was built.

**The settings seed instruction lines, and the lines are what the model gets.**
`seedMapInstructions` renders `map-instructions.md` from the shape — "Use 5 main
headings, and 4 sub-headings under each one" — and the learner sees that text before
pressing the button and can rewrite any of it. `topics.map_instructions` is `""` until
they do, so moving a chip re-seeds; once it holds text, the text is what reaches the
model and what a rebuild shows, and the chips stop touching it. The same pattern runs on
the content side through `seedContentInstructions` and `paragraphLength`. A chip is a
setting somebody has to imagine the effect of; a sentence is one they can disagree with.
A seed is not the only route a setting takes, though, and it must not be: the learner
can write over the lines, so every setting says itself in `content-rules.md` as well.

## Accounts and sessions

**There are no roles, and there are two kinds of route.** Every *write* is ownership,
checked by scoping the query to `c.get("userId")`: a write that forgets the scope is a
data leak, not a missing feature. Every *read* of generated content is public, addressed
by the owner's username under `/api/u/:username` (`src/public.ts`). There is no admin and
no sharing model between accounts; do not add a role column without a reason that
survives that sentence.

**What was generated is public; what the learner did with it is not.** The map, the
seven answers it was built from, the settings and instruction lines it was written to,
the cards, the drills and the questions asked on a card are model output somebody paid
for once. Which nodes they have finished, what is due for review, where they left off and
their profile are the record of a person studying, and stay theirs. `PublicNode` is
`LearningNode` without `status`, so a public route cannot leak one and still compile —
that is the line, and it is held by the type rather than by care.

Two properties of the public router make it safe to leave open, and both are structural
rather than promised: it is handed **no LLM provider**, so a stranger walking somebody's
map cannot spend their model budget — a card that has never been written answers 404
rather than being written on the spot — and it **writes nothing**, so reading a card does
not mark it seen for its owner. Both are why these are their own routes rather than the
authenticated ones with the ownership check taken off: those generate on a miss.

**A username is what a learner is addressed by**, and it is the old `users.slug` grown a
second job. It is allocated once at registration from the email (`emailSlug` then
`uniqueSlug`), never changed — the audio bucket is laid out by it, so a new one orphans
every recording — and it is unique. Nothing lists usernames: a name is something you are
given, not something to walk.

Identity is email + password, in `src/auth.ts` and `src/password.ts`:

- **scrypt from `node:crypto`**, not argon2 from npm — memory-hard, and no native build
  step to ship. The cost parameters are stored *in* the hash
  (`scrypt$N$r$p$salt$hash`), so they can be raised later and older hashes still verify
  against their own parameters. Raising `N` needs no migration.
- **`passwordHash` is omitted globally** by the Prisma client's `omit` config, so it
  cannot reach a response by accident. Login is the one deliberate opt-out
  (`omit: { passwordHash: false }`); if you write a second one, be sure it is.
- **Login verifies against a dummy hash when the address is unknown**, so a wrong
  address and a wrong password take the same time. Returning early on a missing user
  would leak which addresses have accounts. Registration answers `409` on a taken
  address on purpose — that is a usability call, not an oversight.
- **Sessions are opaque bearer tokens** (24 random bytes) in `auth_sessions`, expiring
  after 30 days and checked on every request. An expired row is deleted when it is
  hit, and a login sweeps that user's lapsed rows, so nothing has to cron the table.

**Registration is open**, which is what makes the generation budget below the only
thing standing between an anonymous visitor and an unbounded model bill.

## LLM providers

The server talks to exactly one interface, `LlmProvider` in `src/llm/types.ts`, with a
single method that returns text. Everything above it asks for JSON matching a Zod
schema through `generateJson`, which validates and retries once with the validation
errors named, and logs both attempts when it gives up — the 502 is a sentence for the
learner, so without that log a failed generation leaves nothing on the box to read.

**Three models, chosen by what the call is for, never by where it is called from.**
`LlmTask` has three members and `modelFor` is the only place a model name is resolved:

- `LlmTask.Map` — the map, the seven choices in front of it, and one group rebuilt.
  `LLM_MODEL`, a reasoning model. A map is generated once and everything hangs off it:
  a bad cut of the subject is wrong on every screen afterwards and cannot be corrected
  without rebuilding.
- `LlmTask.Content` — cards, drills, review items and verdicts. `LLM_CONTENT_MODEL`, a
  fast one. These are written many times per map, each already scoped by the map above
  it, and each cheap to write again — the controls under a card do exactly that.

- `LlmTask.Speech` — a card read out. `LLM_AUDIO_MODEL`, a TTS model. It is in the same
  enum because it answers the same question — which model runs this call — and behind a
  different interface, because a TTS name does not answer `:generateContent` with prose
  and a text name does not answer with audio. `TextTask` is the union of the other two,
  and it is what `createProvider` takes: `createProvider(LlmTask.Speech)` does not
  compile, and `createSpeechProvider()` is the way to the third.

An unset `LLM_CONTENT_MODEL` falls back to its own default rather than to `LLM_MODEL`,
so a deployment that names only the map model still gets the cheap one for content. The
audio model has no fallback at all worth having, which is why it is its own variable:
falling back to the content model would produce a call that fails at runtime with a
message about the wrong thing.

**A reasoning model spends its thinking from `maxOutputTokens`.** Gemini 3 Pro cannot be
told not to think, and a budget sized for the reply alone is eaten by the reasoning:
the reply comes back as `MAX_TOKENS` with half a JSON document, or with no text at all.
That is why the map-shaped calls carry 32768 and why `gemini.ts` reads `finishReason` —
a truncated reply that does not say so arrives as "the model could not produce content
in the required shape", which names neither the cause nor the fix.

Adding a provider is therefore:

1. a new file beside `src/llm/gemini.ts`,
2. one branch in `src/llm/registry.ts`,
3. one env var, and one line in the block of `.github/workflows/deploy.yml` that
   writes `/etc/interestled-api.env` — that file is rewritten whole on every
   deploy, so a key omitted there is a key the service never sees.

**An unset repository variable is not an absent line.** The workflow writes
`LLM_MODEL=${{ vars.LLM_MODEL }}`, and an unset variable interpolates to nothing, so
the file gets `LLM_MODEL=`. Zod fills a default for `undefined` and not for `""`, so
every optional variable in `env.ts` is wrapped in `unsetWhenEmpty` — without it, adding
a variable nobody has set yet fails the parse on the first request and takes down
registration, login and the map screen for what is supposed to be an optional setting.

No migration, because `LLM_PROVIDER` is configuration rather than data. Nothing else
in the codebase may name a provider.

**The prompts are Markdown, not TypeScript.** Every prompt lives in
`apps/server/src/llm/prompts/` as one `.md` file, filled by `render` in
`template.ts` — the part of Mustache that is `{{name}}`, `{{#name}}…{{/name}}`
and `{{^name}}…{{/name}}`, and nothing else. `prompts.ts` holds only the
choosing: which block applies and to what, because those conditions are keyed on
enums the type system should be keeping exhaustive.

`render` throws when the template names something the call did not supply, and
when the call supplies something the template does not name. Both are otherwise
silent: an unfilled `{{level}}` reaches the model as those eight characters, and
the model answers it with something plausible and wrong.

**Write every prompt in plain, human English — no AI slop.** A prompt is read by
a model that will write in the register it was written in, so a prompt padded
with "leverage", "delve", "it is important to note", "comprehensive" and
"crucial" produces content padded the same way. Say the thing:

- Short sentences, ordinary words, one instruction per line. If a sentence has a
  clause that could be deleted without losing an instruction, delete it.
- No filler openings ("In this section we will…"), no restating the request back
  before answering it, no summarising at the end what was just said.
- Name the concrete thing rather than the category: "the headings, one per line",
  not "appropriate structural elements".
- Say what to do, not how much to care. "Four options that are really the same
  option is the one way this fails" beats "it is critically important that the
  options be meaningfully differentiated".
- The same holds for the copy on the screens. The rules the model must never
  break live in `system.md`, and the tests in `apps/server/test/prompts.test.ts`
  are what keeps them from being softened by accident.

They are read from disk rather than bundled, because `__dirname` does not exist
under the ESM `tsx` and `vitest` run, and `import.meta.url` comes out
`undefined` once esbuild has emitted CommonJS — so `promptFiles.ts` looks in the
places the folder can be and takes the one that exists. `build-server.sh` copies
the folder next to `index.js`, the same as the Prisma engine, and fails the build
if it did not land.

**Generation is the only expensive call, and registration is open.** Every path that
reaches the model is inside a per-user ceiling (`assertWithinBudget` in `topics.ts`),
and **every ceiling is off unless the deployment names it** — `LimitsSchema` in
`env.ts`, one repository variable per ceiling, where unset is no ceiling and costs no
query. They are off because a map is built inside the request and CloudFront gives up on
the origin at 60s while the server finishes anyway: two retries after a timeout spent
the hour's nodes on maps nobody saw, and the ceiling then refused the one person it was
not protecting anything from. Who else can register is a deployment's decision rather
than a constant. Adding a new generating endpoint still means wiring it into one of
them, or it is an endpoint no deployment can put a ceiling on. Note what each counts: rebuilding a map or one group creates no
topic, so a topic count alone would leave every rebuild outside the budget entirely —
nodes generated in the last hour is the limit that actually binds. The seven choices
need a third counter for the same reason in reverse: they are generated *before* any
topic or node exists, so `map_plans` rows in the last hour are what bounds them — and
that counter guards the questions endpoints only. Gating the build on it too would tell
a learner who had just answered seven questions that they could not have the map.

**What the model writes is Markdown, and it is rendered as Markdown.** Every string
value the model returns — claims, mechanism bodies, drill prompts, review answers,
verdict notes — reaches the screen through `Markdown` / `InlineMarkdown` in
`packages/ui`, which parse the subset the system prompt asks for: inline emphasis, code
spans, links, and bullet, numbered and fenced blocks. A plain `<Text>` shows the
asterisks and backticks instead, and a list arrives as one long line. Titles are the
exception and are plain text, because they are also button labels and screen titles,
where no component can go.

**A map is built from seven choices, not from the form alone.** The create form says
what someone wants; it does not say what the map should look like, and the model's
first guess at that is the one decision nobody gets to correct until the whole map is
built and wrong. So `POST /api/topics/questions` asks the model for seven questions
with four options each, the learner picks, and the picks go into `mapPrompt`.

- **The kinds are an enum, not free text.** `MapQuestionKind` fixes seven slots in one
  order — outline, breakdown, known, recap, scope, examples, opening — and
  `MapQuestionSet` refuses anything else. Answers are keyed by kind, so a missing kind
  is a question nobody is asked and a repeated one is an answer that overwrites another.
  An answer with nothing picked is refused, because a skipped question is the answer
  being absent rather than present and empty.
- **An option is a sample, not a description.** Nobody can answer "how technical should
  the examples be"; everybody can pick one of four examples. What reaches the prompt is
  the sample as well as the label, because the sample is what was actually chosen.
- **Any number of the four, and what was left goes to the prompt too.** The options are
  rarely exclusive — two cuts of a subject can both be wanted and blended — so an answer
  is a set of indexes rather than one, and forcing a single pick would throw away half of
  what the learner meant. `choicesBlock` sends the picked options *and* the passed-over
  ones with their samples: the four were only ever meaningful against each other, and
  without the rejected ones the model is free to build the very cut just turned down. The
  prompt says picks are instructions and passed-over ones are what they saw and did not
  want, because "not picked" means different things on different questions — on *scope*
  it means keep that.
- **Every question is skippable, and a skip is absent from the prompt.** Seven mandatory
  questions between "I want to learn this" and the map is exactly the setup cost A14
  bans, and a default nobody chose is worse than no answer.
- **The questions are stored, and answers are read against the row they came from.** An
  answer is "the second option", which means nothing beside a different four options —
  so `map_plans` holds the questions, and `planId` travels with the answers.
- **Two of the seven spend what the learner typed into "what do you already know".** A
  sentence about what somebody knows is not something a model can act on safely; four
  named sets of headings it could drop is, and only the learner can say which set is
  right. *recap* then asks how much of what goes still gets a mention. They replaced
  questions about code and about numbers, which asked how content is written when the
  content settings already decide that.
- **Nothing between the form and the map is component state.** The three answers, the
  shape, the lines, the questions, the picks and the topic a failed build left behind are
  one draft (`apps/mobile/lib/mapDraft.ts`), written to disk. Building is half a minute
  of model call that CloudFront abandons at 60s and that the model can fail outright, and
  every one of those used to land on a sheet whose state went with it — so the way out
  was answering seven questions again for a map already asked for. The draft is what the
  review screen (`app/topic/new/review.tsx`) is made of: every answer on one page, each
  changed in place, the build button under them, and a failure landing there with
  everything still in it. A retry after a failure rebuilds the topic that build left
  behind (`topicSlug` on `ApiError`) rather than creating a second one.
- **A full rebuild asks them again**; a group rebuild does not. The questions are about
  the shape of the whole map, and a group rebuild leaves the rest of it alone. The one
  exception is the retry after a failed build, which falls back to the plan already
  linked to the topic — the screen promises nothing was lost, and the plan is linked
  before the map is generated, so nothing is. The map being replaced is never sent to
  the questions call: the learner is describing the map they want, not editing the one
  they have, and showing the old one only invites it back as one of the four.

**A card is written into the map, not beside it.** `cardPrompt` is given every node of
the topic as an outline — every heading, in reading order, with the one being written
marked (`mapOutline` in `src/llm/outline.ts`). Everything above the mark is covered and
must not be explained again; everything below it must not be spent early. The outline
comes off the tree rather than off the level count, so two- and three-level maps need no
separate path. It is read on a cache miss only: a hit must not become a second query on
every card view.

**A card is one explanation, not six notes about the same subject.** The slots are
read top to bottom in one sitting, so each one starts from what the one above it
established: the mechanism sections are a chain in order rather than a set, the example
is that mechanism happening, and the misconception is a belief still holdable after
reading both. Two things in the prompts do the work, and both are easy to undo by
accident. `card.md` says what a heading is for — the step of the argument the paragraph
under it makes, never the name of a term — because a card whose headings are terms is a
glossary whatever the schema says, and the paragraphs under them stop needing each
other. (It used to ban the label outright, when the mechanism was bare strings and
`Central bank monetization: the Reichsbank bought…` was the only place a name could go.
There is somewhere to put it now; the failure it was guarding against is unchanged.)
And the `SYSTEM` rule is *cut recaps*, not *cut transitions*: guideline A17 is about the
three minutes of "last time we covered", and reading it as a ban on connectives is what
produced cards written as disconnected fragments. Both halves are covered by tests.

**Changing how a card is written reaches nobody until `CARD_PROMPT_REVISION` moves.**
Cards are cached forever, keyed by `(nodeId, depth, cardVariant(settings))`, so a
rewritten `card.md` shows up only on nodes nobody has opened. The revision is part of
the variant string — bumping it retires every cached card with no migration and
nothing to delete, and the superseded rows go with their node. Bump it whenever the
change is to how an existing card should read.

**Never cache a grading call.** A cached verdict is a verdict on somebody else's
answer. Cards, drills and review items are cached deliberately; `gradeAttempt` is the
one call that must be live, and it runs at `temperature: 0` so the same answer does
not get two different verdicts.

**The card's own settings are what the controls under it change.** `CardSettings`
(depth, minutes, englishLevel, technicalDetail, format, angle, instructions) is what
`cardPrompt` reads, what the card cache is keyed by — `cardVariant` builds the variant
half, depth has its own column — and what the card route answers back, so the panel can
state where the card stands rather than guessing. The topic's settings are the defaults;
each control is an override for one card. A control that does not reach the prompt is a
control that does nothing, which is what "Simpler" was at depth 1: a refetch returning
the identical card. `defaultCardSettings` lives in `packages/domain` rather than on the
server, because the app names what a card is being written to while it waits for it.

**`instructions` is the one setting that is not a chip and not in the key.** It is the
node's own text (`learning_nodes.card_instructions`), saved by `PUT
/nodes/:id/card-instructions` and read off the row rather than sent in the query, so it
holds for the next writing too. The prompt gets it after the topic's standing
instructions, as its own block in `content-rules.md`, told which wins. Free text cannot
be a cache key without being hashed, and a hash cannot say what it was — so the card
row stores the text it was written with (`concept_cards.instructions`), and a row found
at its key with other instructions on it is answered as it is. That is the same rule as
below, and the panel handles it the same way.

**Regeneration is manual: nothing about a settings change writes a card.** Changing the
topic's writing settings used to delete its cached cards, and the next open of every
node was then a model call and a thirty-second wait, whether or not the reader wanted
that card different. Now the settings change writes nothing, and the card route has
three lookups (`CardLookup` in `learning.ts`): *Exact* for a moved chip, which reads or
writes the card at those settings; *Rewrite* for `?rewrite=1`; and *Written* for a plain
open, the drill and the review items, which answers a miss with the newest card the node
already has. `parseCardVariant` is what lets a row say what it was written to — and it
returns null for an earlier prompt revision, so bumping `CARD_PROMPT_REVISION` still
retires everything. The route answers `settings` (what the card was written to) beside
`defaults` (what a plain open writes to now, from the server because the sticky depth is
there), and the panel compares the two: where they differ it says the settings have
moved and offers the one button. The drill goes through *Written* on purpose — a drill
written against a fresh card would be the regeneration the card route just declined,
through a side door.

**`?rewrite=1` is the one call that must go around the card cache**, and one of two a
learner can repeat without bound — every other generating path either creates nodes or
is answered from the cache the second time. It is therefore inside `assertRewriteBudget`
(cards written per user per hour), and its upsert moves `createdAt` with the content, or
a rewrite of an old row is one the ceiling never counts. The app uses it for more than
"write it again": when the settings have moved under a card, or its instructions
changed, nothing is cached at the settings the chips stand at, so the press goes around
the cache rather than asking for a card that would only be written anyway.

**The other is a question asked on a card.** `POST /nodes/:id/questions` answers in one
paragraph — the card's own paragraph length, said outright in `question.md` because the
learner may have rewritten the standing instructions and dropped the line — against the
card the learner is reading (the *Written* lookup, never a fresh one), the map with the
node marked, and the last `EARLIER_QUESTIONS` asked on that card, so a follow-up
follows. The row is kept (`card_questions`, gone with its node) and listed on the card,
answers folded behind their questions. It is a model call per press, so it is inside
`assertQuestionBudget`, which counts those rows by the hour. The answer is never cached:
the same words twice is the learner asking again.

**A card can be played, and what plays is not the card read out.** `POST
/nodes/:id/audio` claims the run and answers `202`; a script written with the content
model and said with the speech one happens behind it, and `GET` answers where it has
got to and costs a signature only once there is something to sign. The point of the
script is the half a card cannot survive being spoken: `narration.md` says never to
read a symbol out and never to read a line of code out, and to point at them instead —
*the formula under 'How the rate compounds'*, *the second line of the snippet*. It is
also the one prompt that turns off a `SYSTEM` rule, because "every string you write is
rendered as Markdown" read aloud is a machine saying "asterisk". Both halves are covered
by tests.

- **The recording is of a card, not of a node**, and the app says which. The audio
  routes take the seven settings the card route answered, and resolve the card at
  exactly them. "The newest card this node has" is not the same card: moving a chip
  writes a second one and moving it back serves the first again, so the newest row is
  the one the reader just navigated away from.
- **A rewrite retires the recording without deleting the row.** `card_narrations`
  stores `card_written_at`, the card's own `createdAt` at the moment it recorded, and a
  row that no longer matches is never served — so pressing *write it again* is not
  asking to be read to. Marked stale rather than deleted because those rows in the last
  hour are the ceiling below: a counter another endpoint empties is a counter a learner
  empties, and rewrite-then-play in a loop would cost nothing against the tightest
  budget in the product.
- **The voice is the topic's, and it is in the key.** `NarrationVoice` is eight of
  Google's prebuilt names, picked on the content settings screen and stored on
  `topics.narration_voice`; `DEFAULT_NARRATION_VOICE` is Erinome, which is the even,
  unhurried one — a card is an explanation rather than a performance, and the voices
  with character in them wear through a session. It is the one member of
  `TopicContentSettings` no prompt may see, so `contentRulesBlock` takes
  `WritingSettings` (that type without it) and `cardVariant` never mentions it: keying
  a card on the voice would retire every cached card for a change that cannot alter a
  word of one. What it is keyed into is `narrationKey`, and that is the whole of how
  moving the chip takes effect — a stored row is served only while its key still
  matches the one built now, so a topic put into another voice misses every recording
  it has and records again on the next press. `card_narrations.voice` stays a plain
  string, because it says which voice made a recording that already exists and that may
  be one the enum has since dropped.
- **The bucket is laid out by username, and the key is the recording's identity.**
  `narrationKey` builds `<username>/<topic>/<node path>/n<rev>-<voice>-d<depth>-<variant>.wav`,
  so a card re-recorded in the same voice at the same settings overwrites its own object
  and any of the four changing gets its own. `users.username` is allocated at registration from the address —
  `emailSlug` then `uniqueSlug`, because two accounts at two providers can hold the same
  local part and their folders must not be the same folder — and never changed, because
  changing it orphans everything already recorded. It rides on the session beside
  `defaultDepth`, so the audio routes do not re-read it. Anything searching for the
  slugs that could collide with a base must search on `slugStem(base)`: `uniqueSlug`
  cuts a long base short before numbering it, so the variants of a 58-character base do
  not start with those 58 characters, and searching on the base proposes a taken slug
  forever.
- **Nothing deletes an object.** A re-recording overwrites its own key, but a deleted
  node, a rebuilt map and a bumped revision all leave objects with no row pointing at
  them. There is no lifecycle rule, because expiring a learner's recording silently
  costs a model call to get back. It is a known cost, not an oversight — the fix is a
  sweep by prefix, and it needs `s3:DeleteObject` the API user deliberately lacks.
- **`NARRATION_PROMPT_REVISION` retires every recording**, the same way
  `CARD_PROMPT_REVISION` retires every card. It travels in the key, and the row stores
  the key it was written to, so a bump makes every stored row miss its own lookup. No
  migration, nothing to delete.
- **Gemini answers with raw PCM and no container**, so `pcmToWav` puts a 44-byte RIFF
  header in front of it. Nothing plays headerless samples. WAV rather than MP3 because
  there is no encoder on the shared host and shipping one would be a third application
  on it — the cost is size, about 48 KB a second, which is why the object is made once
  and played from the bucket after that.
- **The press is not the recording.** A script and minutes of synthesis take far
  longer than the sixty seconds CloudFront gives an origin, so the press claims a row
  and answers, and the app polls until `card_narrations.status` settles on `ready` or
  `failed`. Four things hold it up: `claimRun` is atomic (an insert with
  `skipDuplicates`, then an update guarded on the states it may take over from), so two
  presses a moment apart can never both pay; every write a run makes names the
  `createdAt` it claimed, so a run that was declared abandoned and taken over cannot
  land on the row that replaced it; a `pending` row older than `NARRATION_TIMEOUT_MS` is
  *read* as failed, because the run happens in this process and a deploy mid-synthesis
  would otherwise leave a spinner nobody can clear; and `runNarration` catches
  everything onto the row, because there is no longer a request to fail. Building the
  object store stays synchronous, so a deployment with no `AUDIO_BUCKET` still fails the
  press at once and names the variable.
- **Both routes agree that a run under way is a run under way**, whatever writing of the
  card it was claimed for. A card rewritten mid-run leaves a recording being made of
  replaced text: nothing can claim the row until it finishes, and the press cannot take
  it over — so answering "nothing here" on the read while the press answers "pending" is
  a button that flicks between a spinner and an offer and does nothing at all.
- **The ceiling counts runs, not rows.** One row per card means a card that fails every
  time would be retryable without limit; `attempts` is incremented on every claim and
  summed by `assertNarrationBudget`.
- **It is the most expensive press in the product**, so it has the tightest ceiling
  (`assertNarrationBudget`) and both routes are idempotent: a row already current is
  answered rather than remade. The ceiling is checked *after* that, so a press that
  would have cost nothing is never the one refused.
- **`background` on `AppOptions` is where work that outlives its request goes.** The
  default drops the promise on the event loop with a catch — an unhandled rejection on
  a host shared with another application is a two-application outage — and it is a seam
  rather than a bare `void` because a test has to await the run it just started.
- **`GET` must not build the object store until it has something to sign.** It runs on
  every card mount and every return to the foreground, so building it eagerly would make
  a deployment with no `AUDIO_BUCKET` answer 502 on every card open — which is the
  opposite of what optional is supposed to mean. It takes the factory, not the store.
- **The signed URL is never cached and never persisted.** It expires in an hour, so the
  query takes the default policy and `shouldPersistQuery` keeps it off disk — a launch
  that painted a restored link would paint a dead one. It is also the query that polls:
  `refetchInterval` runs at `NARRATION_POLL_MS` while the status is `pending` and stops
  the moment it is not.
- **No player library, and that is a decision rather than an omission.** `expo-audio`
  already carries the whole playback side — `seekTo`, `setPlaybackRate`, position and
  duration — and works on the web, which is the gate, since the same codebase is the
  website. `react-native-track-player` solves queues and lock-screen playback, which
  this does not have, at the cost of replacing expo-audio. The only piece missing was a
  slider, and that is `@react-native-community/slider`.
- **Everything about it is optional in `env.ts`.** A deployment with no `AUDIO_BUCKET`
  serves every other route and fails only the press, with a sentence naming the variable
  that is missing.

**A card is written to the learner's read time, not to a constant.** `CARD_MINUTES_MAX`
is the ceiling one card can hold, and `CardContent`'s limits are the outer bound of a
card that long — not the size of an ordinary one, which is the minutes in the settings.
Length arrives as more mechanism sections, never longer ones: `MECHANISM_SHARE` of the
words are the mechanism, and that budget divided by `MECHANISM_SECTION_WORDS` is the
count `mechanismSections` asks for. **`MECHANISM_SECTION_WORDS` is keyed by
`paragraphLength`**, and that is the whole of how that setting takes effect — the word
budget is the read time's, so a longer paragraph is fewer of them rather than a longer
card. A constant there is what made the chip unanswerable: `card.md` asked for two to
four sentences a section whatever it said, so moving it wrote the same card again under
a new cache key. Do not also fix the count — a fixed count and a
fixed section length between them already decide a card's length, and naming a read time
as well is what left the read time as the part that gave way. `MAX_MECHANISM_SECTIONS`
is derived from the same constants, so a count the prompt asks for can never be one the
schema refuses. Changing a topic's `averageReadTime` rescales its leaves' minutes
(`rescaleMinutes` in `topics.ts`), because the node's own estimate is what the default
card length is capped to: without that the setting is half-applied and a ten-minute
topic still writes three-minute cards.

**The mechanism is headed sections, and the heading is a title.** `mechanism` is
`{heading, body}[]`: a short paragraph with a name over it, because thirty unlabelled
items running down a ten-minute card give the reader nothing to navigate by. The heading
is plain text like every other title in the product — set as a heading rather than
parsed as one, so a `**` in it renders as asterisks — and the body is Markdown like the
rest of the card. Anything downstream of the card takes both: `mechanismProse` in
`prompts.ts` joins each heading to its body for the drill and review calls, because a
drill is written against what the card said and dropping the heading loses the step the
paragraph is about.

**`example` and `misconception` are written where they apply, not always.** A node that
is itself one case has no second case to instantiate it with, and a descriptive node has
no wrong belief to correct; demanded anyway, both come back as the node restated under a
heading promising something new. They are optional in `CardContent` and `card.md` states
the test for earning each. `claim` and `mechanism` stay required. Anything reading a
card must handle their absence — the screen drops the section, and `drill.md` and
`atoms.md` drop the line rather than labelling a blank the model would then answer.

**Every topic carries its own writing settings** — `englishLevel`, `technicalDetail`,
`format`, `paragraphLength`, `averageReadTime` and `contentInstructions`, defaulting to
`prompts/content-instructions.md` when the learner has written none. The first two are
independent on purpose, and `content-rules.md` says so to the model: two rules pulling
opposite ways are two rules it resolves by picking one. `contentSettingsOf(topic)` is
what every generating call passes. Changing them deletes nothing: every card already
written keeps its writing and says under it that the settings have moved (see
*Regeneration is manual* above), and nodes nobody has opened are written to the new
settings. Drills are kept for the older reason: deleting one cascades to the attempts
made against it.

`TopicContentSettings` carries one member that is not about the writing at all —
`narrationVoice`, above — and the route that saves them decides whether anything
changed by walking `TopicContentSettingsInput.keyof()` rather than by a list written
out. The list had gone stale: `paragraphLength` was never compared, so a save that
moved only that chip answered 200 and stored nothing.

## The cache on the phone and the website

The app is one codebase on two devices, and somebody switches between them: a node
drilled on the website has to be `Verified` on the phone the moment it comes out of a
pocket, and the phone has to open on something rather than on a spinner. Both come out
of one query cache with one policy, in `createAppQueryClient` in `packages/api`, and
`packages/api/test/queryClient.test.ts` pins it.

- **Learner state is never trusted past the moment it arrived.** Topics, the map with
  its statuses, the review batch and the profile have `staleTime: 0`: a screen mounting
  asks again, and so does the app coming to the foreground. The old answer stays on
  screen while the new one is fetched, so nothing blanks — the map corrects itself. A
  phone has no tab to lose focus, so `useAppFocus` in `apps/mobile/lib/focus.ts` feeds
  `AppState` to the cache's `focusManager`; without that line the phone never hears it
  was put away, which is exactly when the website was open.
- **Generated content is left alone.** Cards keep `CONTENT_STALE_MS` and drills are
  stale never, and neither refetches on focus: a card must not swap under the reader
  when the phone unlocks, and a drill must never change under a half-typed answer. They
  are server-cached by the settings they were written to, and everything that changes
  them — content settings, a rewrite, a map edit — already writes into or invalidates
  the cache by hand. Both are set with `setQueryDefaults` on the `keys.cards` and
  `keys.drills` prefixes, so a new card or drill hook inherits the policy by its key.
- **The cache is written to disk and read back on launch.** `PersistQueryClientProvider`
  in `app/_layout.tsx` with `queryPersister` (AsyncStorage, which is localStorage on
  the web) paints the last topics, map and card at once, and the refetch above makes
  them right. The signed-in user is stored beside the token for the same reason: with
  both on disk the app opens on the app, and the `me()` round trip confirms them behind
  the first screen rather than in front of it.
- **One key is deliberately never written to disk.** A card's recording is answered as a
  signed URL with an hour on it, so `shouldPersistQuery` drops `keys.audio` out of what
  is persisted: restoring it on the next launch paints a button pointing at a link the
  bucket has stopped honouring, which is exactly the press the persisted cache existed
  to make instant.
- **Bump `PERSISTED_CACHE_VERSION` when a response shape changes.** A restore does not
  parse what it reads back, so a field added to `TopicDetail` is `undefined` off a
  cache written by the previous build until the refetch lands. Moving the version
  discards the persisted cache on the next launch — the same idea as
  `CARD_PROMPT_REVISION`.
- **A sign-in starts from an empty cache, and a sign-out empties the disk too.**
  `clearSession` calls `removeClient` on the persister rather than waiting for the
  throttled write, and `adopt` clears before it stores the token, so a sign-out cut off
  early never hands the next person the last one's map.

## The component set

**Every control is react-native-reusables underneath.** The components are
vendored into `packages/ui/src/ui/` from the library's NativeWind registry — the
shadcn model, where the code is copied in and owned rather than imported from a
package that must be themed around. Buttons, inputs, cards, labels, badges,
separators and the text scale all come from there; `packages/ui/src/components/`
holds only what this product composes on top of them.

- **Theming is the token names, not the components.** The vendored files are
  written against shadcn's semantic tokens, and `packages/config/tailwind-preset.js`
  names the palette a second time under those names — `primary` is `accent`,
  `muted-foreground` is `ink-soft`, `border` is `line`. Editing colours into a
  vendored component is what makes the set impossible to update; add the mapping
  instead. One token does not survive the trip and is written `accent-tint` in
  the two places that wanted it: shadcn's `accent` is a faint pressed-state wash,
  and here `accent` is the blue.
- **The vendored files carry no `dark:` classes.** The app is
  `userInterfaceStyle: "light"`, and a dark variant with no dark palette behind
  it is a claim the app cannot honour.
- **A wrapper exists only where the composition is a product rule.** `Button`
  always carries its own label and busy state, `Input` always carries its own
  label, `Skeleton` is a stack of bars in the shape of what is loading. Where
  there is no such rule the vendored component is exported straight — `Card` is
  the whole of `Card`. A wrapper that only renames a variant is one more thing to
  keep in step.
- **The keyboard is handled once, above every screen.** Neither mobile browser
  shrinks the page when the keyboard opens — the layout viewport keeps its
  height and the keys are drawn over the bottom of it — so a screen that is one
  full-height scrolling box has a dead band at the bottom that no amount of
  scrolling can lift a field out of. `KeyboardInset` wraps the navigator in
  `app/_layout.tsx` and shrinks the whole app by `keyboardOverlap`, the
  difference between the layout viewport and the visual one, then puts what is
  focused back in the middle of what is left. It reads the focused element off
  the document rather than being told where to look, which is what lets one copy
  serve everything. Per-screen was the obvious way to write this and the wrong
  one: "which screens have a field" gets a different answer every time somebody
  adds one, and the screen that gets missed is found by a learner typing into a
  box they cannot see. `Sheet` carries the inset a second time, and is the only
  thing that has to — a modal is mounted outside the root view on the web.
- **Every screen is a `Screen`, never a bare `ScrollView`** — the ones with no
  field on them today included, because that is what stops the question being
  asked again when one is added. It is a `ScrollView` carrying the props that
  have one right answer with a keyboard up: `keyboardShouldPersistTaps="handled"`,
  so the button under the keyboard takes one tap rather than two, and iOS's own
  `automaticallyAdjustKeyboardInsets`, which does the inset and the scroll
  natively there. `no-restricted-imports` in the shared ESLint config is what
  holds the rule, since a screen written the old way looks right until somebody
  is typing into it on a phone. Three files disable it and say why: `Screen`
  itself, `Sheet`, and the sideways scroller `Markdown` puts a wide fenced block
  in.
- **Back means up one level, and Android's own button says the same thing.**
  Every URL here can be opened cold, so a screen with nothing under it in the
  stack is ordinary rather than an edge case — `goBack(fallback)` replaces
  rather than popping when there is nothing to pop, and `useHardwareBack` gives
  Android's button the same answer. Without it that press falls through to the
  system and closes the app on a learner in the middle of a card. Every screen
  that shows the bar's back button calls the hook with the same fallback; the
  topics list is the one screen that deliberately does neither, because back
  from there is leaving. And none of it runs at all with Android's predictive
  back gesture on — it is on by default targeting Android 16, react-native-screens
  does not implement it, and the press then never reaches JavaScript. That is what
  `"predictiveBackGestureEnabled": false` in `app.json` is for; deleting the line
  breaks every back button in the product.
- **Nothing may touch a released native object, and a cleanup is where that
  happens.** `useAudioPlayer` releases its player from its own cleanup, which
  runs before any effect declared after it, so a `player.pause()` in a later
  cleanup runs against a released object — which throws, out of an unmount, where
  nothing can catch it: a red screen in development and a dead app in a release
  build. `CardAudio` resets on the way in by comparing the card key instead. The
  same shape of trap is in every `use*` hook that hands back a shared object.
- **`keyboardDismissMode="on-drag"` is native-only.** react-native-web hangs it
  off every scroll event rather than a drag, so on the web it blurs the field on
  the very scroll that reveals it — the keyboard closes as you tap into the box.
  A screenshot does not show it: the field is where it should be, and only the
  focus is gone. It was found by checking `document.activeElement` after the
  reveal, which is worth doing again to anything else that scrolls a form.
- **`cn` is what makes an override work**, and it has to be taught anything
  Tailwind did not ship: `rounded-card` is registered on its border-radius theme,
  or `cn("rounded-md", "rounded-card")` emits both and the winner is whichever
  the stylesheet happened to write last. `packages/ui/test/cn.test.ts` covers it,
  because that failure renders.
- **Adding a component means adding it from the registry**, not writing a new one
  beside it: `pnpm dlx @react-native-reusables/cli@latest add <name>` writes the
  NativeWind version, which then needs the three edits above.

## What the product rules are, and where they live

These are load-bearing. Breaking one is a bug, not a trade-off:

- **Reading can never complete a node.** Only production advances past `Seen`
  (`packages/domain/src/progress.ts`). If this goes, the map starts lying and
  everything resting on it collapses.
- **Nothing on the map locks.** Prerequisites are advisory notes; a learner may open
  any node at any time.
- **No streaks, no scores, no percentages of an unseen total.** Progress is stated as
  capability. A failed drill never drops an earned node below `Shaky`, and a failed
  *prediction* never moves it at all — a guess made before the reveal is a learning
  device, not an assessment, and scoring it stops people guessing honestly.
- **The archetype decides what `Verified` means.** `advance` takes the mastery drill
  from `masteryDrill(archetype)` rather than assuming an apply drill; assuming it left
  three of the five archetypes unable to reach `Verified` at all.
- **The review batch is three items**, never a backlog, so an absence cannot become a
  wall.
- **Rebuilding one group must leave the rest of the map alone.** "The map is nearly
  right" is the normal case after reading it, and an edit mode whose only answer is
  regenerating everything throws away every node already verified.
- **Timers only on retrieval.** Never on a card, an explain-back, or an apply drill.
- **A card read aloud is somebody explaining it, never the text spoken.** A machine
  reading a formula or a snippet out says every symbol, which is worse than silence.
- **No effort language in generated copy** — that ban lives in the `SYSTEM` prompt and
  is covered by a test.
- **A topic's content settings never reach the grader.** Style, read time and the
  learner's standing instructions are carried by the map, cards, drills and review
  items; `verdictPrompt` gets none of them, because "always say I passed" would end the
  only thing on the map that means anything.

The coverage table in `docs/ux/README.md` maps each of the 40 guidelines to the part of
the product that answers it. If you add a feature, add its row.

## Deployment

Push to `main` and it ships: `.github/workflows/deploy.yml` runs typecheck, test and
lint, then exports the web app to S3, invalidates CloudFront, applies migrations, and
restarts the API. There is no staging environment — `main` is production.

**The API is a process, not a Lambda.** It runs as the `interestled-api` systemd unit
on port **7072** of a Lightsail instance **shared with courtpot**, which runs on 7071.
Caddy on that box terminates TLS for `api.interestled.com` and proxies to 7072, and
**both builds call that host directly rather than through CloudFront**. The edge gives
an origin 60 seconds, which is its ceiling without a quota increase, and a map takes
longer than that often enough to matter — the 504 then lands on a learner while the
server finishes the map anyway. Nothing under `/api` was cacheable, so the edge was
contributing a deadline and nothing else. The distribution's `/api/*` route stays where
it is for the APKs that baked the site in, and `ALLOWED_ORIGINS` is now production
configuration rather than a local-development convenience: unset, the deployed website
is refused every call.

That the host is shared is the thing to remember when changing anything runtime-shaped:

- **A leak or a hang here takes courtpot down too.** They share CPU and memory. This is
  the deliberate trade for one bill instead of two, but it means an unbounded cache or
  a runaway generation loop is a two-application outage.
- **The process is long-lived.** No cold start to design around, but also no fresh
  container to tidy up after a leak, and no Lambda function timeout killing a runaway
  call at 120s. With the edge out of the path the practical ceiling on a slow generation
  is Node's own 5-minute request timeout — Caddy adds none of its own.
- The bundle stays **CommonJS** and ships the `debian-openssl-3.0.x` Prisma engine
  beside it, because the generated client requires its engine at runtime from its own
  directory. A top-level `await` in `src/index.ts` would force ESM and break that.

**The API has AWS credentials of its own, and they are not the deployer's.** The audio
bucket is the only thing in the account the running process touches, so
`interestled-api` is a second IAM user with put and get on that bucket and nothing else
— the box is shared with courtpot, and the blast radius of a key on it is worth keeping
small. Both keys reach the env file through `API_AWS_ACCESS_KEY_ID` and
`API_AWS_SECRET_ACCESS_KEY`, which are different secrets from the ones
`configure-aws-credentials` uses for the web sync.

**`/etc/interestled-api.env` is rewritten whole on every deploy** from repository
secrets and variables. Nothing set by hand on the box survives, which is the point —
the workflow is the source of truth. The corollary is in *LLM providers* above: a key
that is not in the workflow is a key the service never sees.

**`LLM_MODEL` and `LLM_CONTENT_MODEL` are repository variables, not constants.** Google
retires models — `gemini-2.0-flash` began returning 404 "no longer available" in August
2026, which fails every generation at runtime while registration, login and the map
screen all look healthy. Moving on is a variable change, not a release; the defaults in
`env.ts` are only defaults. Note that `gemini-3.1-pro-preview` is preview-only — there
is no stable `gemini-3.1-pro` on the Gemini API — so it is a name worth re-checking
rather than assuming.

**Migrations run from the GitHub runner** against RDS, before the new code ships, so a
failed migration stops the deploy with the old version still serving. Schema changes
must therefore be backward-compatible with the running code for the few seconds
in between. See `deployment/README.md` for the host, the Terraform stacks, and what to
do when the instance is recreated.
