# Accounts, ownership and budgets

Registration is open, writes belong to whoever made them, reads of generated
content belong to everyone, and the only thing that can stand between an
anonymous visitor and an unbounded model bill is the set of ceilings at the
bottom of this document — every one of which is off until a deployment sets it.

## There are no roles, and there are two kinds of route

**A write is ownership, checked by scoping the query to `c.get("userId")`.** A
write that forgets the scope is a data leak, not a missing feature. In practice
every one either filters on the user directly (`db.topic.findFirst({ where: {
userId, slug } })`) or reaches them through the relation
(`db.learningNode.findFirst({ where: { id, topic: { userId } } })`).

**A read of generated content is public**, addressed by the owner's username —
see the next section. There is no admin and no sharing model between accounts:
those are the only two rules, and a role column needs a reason that survives
that sentence.

## What is public, and what is not

`apps/server/src/public.ts`, mounted on `/api/u` before the authenticated
sub-app.

**What was generated is public; what the learner did with it is not.**

| Public | Private |
|---|---|
| The topic and its settings | Node statuses, the progress count, the resume point |
| The map | The review batch and study sessions |
| The seven questions and the answers picked | The profile |
| The instruction lines the model was given | Attempts and verdicts |
| Cards, drills, questions asked on a card, recordings | Everything that generates |

```
GET /api/u/:username/topics                  their topics
GET /api/u/:username/topics/:slug            the map, and everything it was built from
GET /api/u/:username/nodes/:id/card          the card as written
GET /api/u/:username/nodes/:id/drill         the drill as written
GET /api/u/:username/nodes/:id/questions     what was asked on that card
GET /api/u/:username/nodes/:id/audio         the recording, if one was made
```

Four things hold the line, and three of them are structural rather than
promised:

- **`PublicNode` is `LearningNode` without `status`.** A public route that
  reached for one would not compile. The shapes are in
  `packages/schemas/src/public.ts` and every response is parsed through them.
- **The router is handed no LLM provider.** A card that has never been written
  answers 404 rather than being written on the spot, so a stranger walking
  somebody's map cannot spend their model budget. That is why these are their own
  routes rather than the authenticated ones with the ownership check removed:
  those write on a miss.
- **It writes nothing.** Reading a card does not mark it Seen for its owner and
  does not move their sticky depth.
- **A node is scoped to the username as well as to its id.** The id alone would
  find the row; scoping to the name too is what makes a public URL actually about
  the person it names.

**Nothing lists usernames.** A name is something you are given or told, not
something to walk — there is no route above `/api/u/:username`.

The instruction lines are answered as the model *received* them, not as they are
stored: both columns hold `""` until the learner writes in them, and the seed
rendered from the settings is what the generation saw.

## Identity

`apps/server/src/auth.ts` and `apps/server/src/password.ts`.

- **scrypt from `node:crypto`**, not argon2 from npm — memory-hard, and no native
  build step to ship. The cost parameters live *in* the hash
  (`scrypt$N$r$p$salt$hash`), so they can be raised later and older hashes still
  verify against their own. Raising `N` needs no migration.
- **`passwordHash` is omitted globally** by the Prisma client's `omit` config, so
  it cannot reach a response by accident. Login is the one deliberate opt-out.
- **Login verifies against a dummy hash when the address is unknown**, so a wrong
  address and a wrong password take the same time. Registration answers `409` on
  a taken address on purpose — hiding it only moves the discovery to the sign-in
  screen.
- **Sessions are opaque bearer tokens** (24 random bytes) in `auth_sessions`,
  expiring after 30 days and checked on every request. An expired row is deleted
  when it is hit, and a login sweeps that user's lapsed rows, so nothing has to
  cron the table.

`requireAuth` puts three things on the context: `userId`, `defaultDepth` (the
learner's sticky card depth) and `username`. The last two ride along because they
are on the user row the session already loads and never change — the alternative
is a second query on routes that run on every card view.

## The username

`users.username` is how a learner is addressed: every public read is under it,
and it is the top folder of every audio object the account owns. It is allocated
once, at registration, from the address:

```
emailSlug("Robin.Nagpal+news@gmail.com")  →  "robin-nagpal-news"
uniqueSlug(base, taken)                   →  "robin", "robin-2", …
```

Uniqueness matters: two accounts at two providers hold the same local part, and
their folders must not be the same folder.

Two things to know before touching this:

- **It is never changed.** Changing it orphans everything already recorded, and
  breaks every public link anyone has to their work.
- **Anything searching for the slugs that could collide with a base must search
  on `slugStem(base)`, not the base.** `uniqueSlug` cuts a long base short before
  numbering it, so the variants of a 58-character base do not start with those 58
  characters. Searching on the base misses them, proposes a taken slug, and the
  address can never register.

A collision on the insert is retried (`USERNAME_ATTEMPTS`); a collision on the
email is a different answer and is left to the handler in `app.ts`.

It was called `slug` until it also became an address. The column was **added and
backfilled rather than renamed**, because migrations run before the new bundle
ships and the code still serving selects `slug` by name — a rename would have
made every query touching a user fail for the minutes in between.
`users.slug` is dead and goes in the next schema change.

## Errors and status codes

`apps/server/src/errors.ts` and the handler in `app.ts`:

| Thrown | Status | Means |
|---|---|---|
| `ConflictError` | 409 | A write would violate a business rule, including every budget refusal |
| `NotFoundError` | 404 | Not there, or not this learner's — the two are indistinguishable on purpose |
| `GenerationError` | 502 | The model failed, or the deployment is missing configuration. The message is written to be shown to the learner |
| Prisma `P2002` | 409 | Naming the columns that collided, via `UniqueViolation` |

## The budgets

**Generation is the only expensive call, and registration is open.** Every path
that reaches a model is inside a per-user hourly ceiling — and **every ceiling is
off unless the deployment sets it**, which is how this ships. Adding a new
generating endpoint still means adding it to one of these: a deployment other
people can register on wants them set, and a ceiling nothing is wired into cannot
be turned on later without finding the endpoint again.

Each one is a repository variable of the same name, read by `LimitsSchema` in
`apps/server/src/env.ts` and written into `/etc/interestled-api.env` by the deploy
workflow. Unset is no ceiling; a number is the ceiling; `0` refuses everything.
A value that is not a whole number fails the parse rather than reading as off —
a ceiling somebody mistyped must not be one that silently is not there.

| Variable | Counts | Guards |
|---|---|---|
| `MAX_TOPICS_PER_HOUR` | `topics` created in the last hour | Creating a topic |
| `MAX_TOPICS_PER_USER` | `topics` in total | Creating a topic |
| `MAX_GENERATED_NODES_PER_HOUR` | `learning_nodes` created in the last hour | Every map build **and every rebuild** |
| `MAX_MAP_PLANS_PER_HOUR` | `map_plans` rows in the last hour | The seven questions only |
| `MAX_CARDS_WRITTEN_PER_HOUR` | `concept_cards` written in the last hour | `?rewrite=1` |
| `MAX_QUESTIONS_PER_HOUR` | `card_questions` rows in the last hour | A question asked on a card |
| `MAX_NARRATIONS_PER_HOUR` | `card_narrations.attempts` summed over rows claimed in the last hour | Reading a card aloud |

**Why off by default.** A map is built inside the request, and CloudFront gives
up on the origin at 60 seconds while the server carries on and finishes it. Two
or three retries after a timeout had therefore spent the hour's nodes on maps the
learner never saw, and the next press was refused — the ceiling was hit by the
one person it was not protecting anything from. A ceiling is a decision about who
else can register, so it is a deployment's to make rather than a constant.

An unset ceiling also costs no query: `assertUnder` in `topics.ts` skips the
count when there is nothing to compare it against, so a generating request makes
no budget query at all.

Four things about *what* each one counts are load-bearing:

- **Nodes, not topics.** Rebuilding a map or one group creates no topic, so a
  topic count would leave every rebuild outside the budget entirely.
- **Plans, for the questions.** They are generated *before* any topic or node
  exists, so neither of the other counters can see them. That counter guards the
  questions endpoints only: gating the build on it too would tell a learner who
  had just answered seven questions that they could not have the map.
- **A counter another endpoint can empty is a counter a learner can empty.** This
  is why a card rewrite marks a recording stale instead of deleting its row (doc
  4).
- **A counter that cannot grow is not a ceiling.** `card_narrations` holds one
  row per card, and a failed recording is retried by taking that row over — so
  counting rows, a learner holding down retry on a broken card would never reach
  the limit while spending two model calls a press. The column that is summed is
  `attempts`, incremented on every claim.

Ceilings that guard an idempotent call are checked **after** the idempotency
decision, so a press that would have cost nothing is never the one refused.

`assertWithinBudget` is in `apps/server/src/topics.ts` alongside
`assertRewriteBudget`, `assertQuestionBudget` and `assertNarrationBudget`.

## What must not break

- **Every write is scoped to the signed-in user, and every public read returns
  content only.**
- **Every generating endpoint is wired into a ceiling**, whether or not this
  deployment sets one.
- **`passwordHash` never leaves the server.**

See CLAUDE.md, *Accounts and sessions* and *Generation is the only expensive
call*.
