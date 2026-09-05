# Knowledge base

What each part of Interest Led does, and how it is actually built. One document
per feature, each written to answer three questions: what the learner sees, what
happens when they use it, and which files to open.

**Read the document covering the area you are about to touch before you start.**
These are kept current on purpose — see the note at the top of
[CLAUDE.md](../../CLAUDE.md).

| # | Document | Covers |
|---|---|---|
| 1 | [Topics and the map](01-topics-and-the-map.md) | Creating a topic, the seven questions, the node tree, editing and rebuilding a map |
| 2 | [Cards and writing settings](02-cards-and-writing-settings.md) | The concept card, its slots, the cache, the controls under it, questions asked on it |
| 3 | [Drills, progress and review](03-drills-progress-and-review.md) | The status ladder, grading, spaced review, study sessions |
| 4 | [Reading a card aloud](04-reading-a-card-aloud.md) | The play button, narration scripts, the voice a topic is read in, speech synthesis, the audio bucket |
| 5 | [Accounts, ownership and budgets](05-accounts-ownership-and-budgets.md) | Registration, sessions, usernames, what is public and what is not, every generation ceiling |
| 6 | [LLM providers and prompts](06-llm-providers-and-prompts.md) | Which model answers which call, structured generation, the prompt files |
| 7 | [The app shell and caching](07-the-app-shell-and-caching.md) | Routing, the query cache and what is persisted, the component set |

## How this differs from the rest of the docs

- **[CLAUDE.md](../../CLAUDE.md)** holds the working agreements: the rules, and
  the reasoning behind decisions that look arbitrary until you know why. It is
  the *why*.
- **These documents** are the *what and where*: the shape of each feature and
  the files that implement it.
- **[docs/ux/README.md](../ux/README.md)** is the product design — what the
  interface must do — and
  **[docs/ux/adhd-learning-guidelines.md](../ux/adhd-learning-guidelines.md)**
  the 40 constraints it satisfies.
- **[deployment/README.md](../../deployment/README.md)** is the infrastructure.

Where a document here states a rule that must not be broken, it links to the
paragraph in CLAUDE.md that explains why rather than restating the argument.

## Layout

```
apps/server      Hono API, Prisma, the LLM integration and the prompts
apps/mobile      One Expo codebase serving the website and the Android app
packages/schemas Zod schemas and enums — the single source of truth for types
packages/domain  Pure rules shared by both sides (progress, scheduling, trees)
packages/api     The typed API client, the query cache and its hooks
packages/ui      The component set, vendored from react-native-reusables
packages/config  Shared ESLint, TypeScript and the Tailwind preset
```
