# Accounts, ownership and budgets

Registration is open, every account sees only its own rows, and the only thing
that can stand between an anonymous visitor and an unbounded model bill is the
set of ceilings at the bottom of this document — every one of which is off until
a deployment sets it.

## There are no roles

Every user sees only their own rows, there is no admin, and nothing is shared
between accounts. **Authorisation is ownership, checked by scoping each query to
`c.get("userId")`.** A query that forgets the scope is a data leak, not a missing
feature.

That is the whole of the model. Do not add a role column without a reason that
survives that sentence.

In practice every route either filters on the user directly
(`db.topic.findFirst({ where: { userId, slug } })`) or reaches them through the
relation (`db.learningNode.findFirst({ where: { id, topic: { userId } } })`).

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
learner's sticky card depth) and `userSlug`. The last two ride along because they
are on the user row the session already loads and never change — the alternative
is a second query on routes that run on every card view.

## The learner's slug

`users.slug` is the top folder of every audio object the account owns. It is
allocated once, at registration, from the address:

```
emailSlug("Robin.Nagpal+news@gmail.com")  →  "robin-nagpal-news"
uniqueSlug(base, taken)                   →  "robin", "robin-2", …
```

Uniqueness matters: two accounts at two providers hold the same local part, and
their folders must not be the same folder.

Two things to know before touching this:

- **It is never changed.** Changing it orphans everything already recorded.
- **Anything searching for the slugs that could collide with a base must search
  on `slugStem(base)`, not the base.** `uniqueSlug` cuts a long base short before
  numbering it, so the variants of a 58-character base do not start with those 58
  characters. Searching on the base misses them, proposes a taken slug, and the
  address can never register.

A collision on the insert is retried (`SLUG_ATTEMPTS`); a collision on the email
is a different answer and is left to the handler in `app.ts`.

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

- **Every query is scoped to the signed-in user.**
- **Every generating endpoint is wired into a ceiling**, whether or not this
  deployment sets one.
- **`passwordHash` never leaves the server.**

See CLAUDE.md, *Accounts and sessions* and *Generation is the only expensive
call*.
