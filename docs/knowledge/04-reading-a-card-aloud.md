# Reading a card aloud

A play button under the claim on every card. The first press writes a spoken
script and synthesises it; after that the recording is in an S3 bucket and a
press is a download.

## What plays is not the card read out

A card is written to be looked at: it has formulas in it, snippets, exact
figures. A machine reading those aloud spells out every symbol and says every
backtick, which is worse than silence.

So `apps/server/src/llm/prompts/narration.md` asks for what a person would say
reading the card *with the learner in front of them, pointing at it*:

> the formula under 'How the rate compounds' — the balance times one plus r, all
> to the power n
>
> the second line of the snippet is where the lock is taken

It never reads a symbol or a line of code out, points at sections by what is
written on them (never "above" or "below"), says numbers the way they are read
aloud, and carries no Markdown, stage directions or speaker labels. It is also
**the one prompt that turns off a `SYSTEM` rule** — "every string you write is
rendered as Markdown" read aloud is a machine saying "asterisk". Both halves are
covered by tests in `apps/server/test/prompts.test.ts`.

Length: `narrationWords(minutes)` at `SPOKEN_WORDS_PER_MINUTE` (150), so a card
takes about as long to listen to as to read.

## The two routes

```
GET  /api/nodes/:id/audio?<the seven card settings>   where it has got to
POST /api/nodes/:id/audio?<the seven card settings>   start it
```

The settings are **required and are what the card route answered**. They are the
only thing that says which of a node's cards the button is on: moving a chip
writes a second card and moving it back serves the first again, so "the newest
card this node has" is the one the reader navigated away from.

`GET` costs two queries and — only for a recording there is something to play —
one signature. It never reaches a model, never writes, and **must not build the
object store until it has something to sign**: it runs on every card mount and
every return to the foreground, so building it eagerly would make a deployment
with no `AUDIO_BUCKET` answer 502 on every card open.

`POST` answers `202` and `pending` almost always — see the next section. A
recording already made comes back `200`, which is the one case that costs
nothing. Both are idempotent, and the budget is checked only once past that, so
a press that would cost nothing is never the one refused.

## The press is not the recording

A script and minutes of synthesis take far longer than the sixty seconds
CloudFront gives an origin. So the press claims a row, hands the work to
`background`, and answers; the app polls `GET` until the row settles.

`NarrationStatus` is a TS enum over a plain `TEXT` column, like every other
status in the product:

| Status | Means | What the app shows |
|---|---|---|
| `pending` | Claimed and running | Spinner, and it keeps polling |
| `ready` | The object is in the bucket and is of the words on the card | A green button and a scrubber |
| `failed` | It stopped; `error` says what to tell the learner | A red button and the message |

Three things hold this together:

- **The claim is atomic.** `claimRun` inserts with `skipDuplicates`, so exactly
  one of two simultaneous presses creates the row; if one is already there it
  updates only from the states it may take over from, so exactly one takes it
  over. The loser is told to look at what is there rather than starting a second
  run. Two presses a moment apart must never both pay.
- **A run owns its claim.** Every write `runNarration` makes names the
  `createdAt` it claimed, and it re-checks before putting the object. A run
  declared abandoned is taken over while its process may still be alive — a slow
  speech model finishing at minute eleven — and without the token its write
  would land on the row belonging to the run that replaced it: marking a live
  run failed, or ready with the wrong script. Two runs also write the same key,
  which is why the check is before the put and not only with the row.
- **A run under way is reported as itself, whatever writing it was claimed
  for.** Both routes agree on this. A card rewritten mid-run leaves a recording
  being made of text that has been replaced — its result will never be served,
  but nothing can claim the row until it is done and the press cannot take it
  over either. `GET` answering "nothing" there while `POST` answered "pending"
  is what left the button flicking between a spinner and an offer, doing nothing
  for as long as the run lasted.
- **A run whose process went away is read as failed.** The work happens in the
  API process, so a deploy mid-synthesis leaves a row saying `pending` with
  nothing coming — read literally, that is a spinner the learner watches until
  they give up. `statusOf` treats a `pending` row older than
  `NARRATION_TIMEOUT_MS` as failed. Nothing writes the timeout down: the next
  claim overwrites the row anyway, and a sweeper would be a second thing to keep
  running for a case that resolves itself.
- **Failures land on the row, not on a request nobody is holding.** `runNarration`
  catches everything and writes the message, the same rule a failed map build
  follows — those messages are written to be read by a person.

The one thing that stays synchronous is building the object store. A deployment
with no `AUDIO_BUCKET` fails the press at once and names the variable, rather
than answering "working on it" and failing out of sight a moment later.

`background` is a seam on `AppOptions`. The default drops the promise on the
event loop with a catch — an unhandled rejection on a host shared with another
application is a two-application outage — and a test passes a collector so it can
await the run it just started.

## How a recording is made

All of this runs behind the response, on the row the press claimed.

1. `generateNarration` — the content model turns the card into a script.
2. `speech.speak` — the speech model says it. Gemini answers with **raw PCM and
   no container**: 16-bit mono at the rate named in the part's mime type.
3. `pcmToWav` puts a 44-byte RIFF header in front of it. Nothing plays headerless
   samples, and a header written against the wrong rate plays at the wrong speed
   rather than failing — which is why `sampleRateOf` reads the rate rather than
   assuming it.
4. The object goes to the bucket, then the row is marked `ready`. That order can
   leave an object no row names; the other order marks a recording playable
   while it points at nothing, which the player meets as a broken link.

WAV rather than MP3 because there is no encoder on the shared host and shipping
one would be a third application on it. The cost is size — about 48 KB a second —
which is why a recording is made once and played from the bucket after that.

## Where a recording lives

`narrationKey` in `packages/schemas/src/audio.ts`:

```
<user-slug>/<topic-slug>/<node-path>/n<rev>-<voice>-d<depth>-<variant>.wav
robin/kubernetes/scheduling/taints/n1-erinome-d2-r6-base-3-medium-medium-prose-medium.wav
```

Readable rather than hashed, built from the same slugs the URLs are. The file
name is the recording's identity — revision, voice, depth, card variant — so a
card re-recorded in the same voice at the same settings **overwrites its own
object**, and any of the four changing gets its own.

`users.username` is allocated at registration from the address and never changed —
changing it orphans everything already recorded. See doc 5.

`NARRATION_PROMPT_REVISION` travels in the key, and the row stores the key it was
written to, so bumping it makes every stored row miss its own lookup. No
migration, nothing to delete. The voice below rides in the key for exactly that
reason.

## The voice

`NarrationVoice` (`packages/schemas/src/voices.ts`), per topic on **How it is
written**, stored on `topics.narration_voice`, defaulting to Erinome.

Eight of Google's thirty, and the cut is the product's rather than the
provider's: a card is an explanation, not a performance, and the excitable,
gravelly and breathy voices wear through a session.

Where it goes is what it does, and each of the three matters:

- **In `narrationKey`** — the whole of how moving the chip takes effect. A row is
  served only while its key matches the one built now, so a topic in a new voice
  misses its recordings and records again on the next press. `attempts` keeps
  counting, so this is not a way to record for free.
- **Not in `cardVariant`** — keying a card on the voice would retire every cached
  card for a change that cannot alter a word of one.
- **Not in any prompt** — `contentRulesBlock` takes `WritingSettings`, which is
  `TopicContentSettings` without the voice, so the callers that build one out of
  a *card's* settings have nothing missing to supply.

Two plain strings on purpose: `card_narrations.voice`, which records which voice
made an existing recording and may name one the set has since dropped, and
`SpeakRequest.voice`, where the names are the provider's namespace.
`NarrationVoiceSchema` refuses an unknown one where it arrives.

## Staying honest about what it is a recording of

`card_narrations` is keyed on the **card** (`card_id` unique), not the node.

A rewrite replaces a card's text in place without changing its id, so the row
stores `card_written_at` — the card's own `createdAt` at the moment it recorded.
A row whose value no longer matches is never served: the button goes back to
offering a recording, and a player part-way through the old one stops offering to
resume it.

It is marked stale rather than deleted **on purpose**. Those rows in the last hour
are the ceiling, and a counter another endpoint could empty is a counter a
learner could empty — rewrite-then-play in a loop would otherwise cost nothing
against the tightest budget in the product.

## The player

`apps/mobile/components/CardAudio.tsx`, on `expo-audio` and
`@react-native-community/slider`.

**No player library.** `expo-audio` already has the whole playback side —
`seekTo`, `setPlaybackRate`, `playbackRate`, `currentTime`, `duration`, `volume`,
`muted`, `loop` — and supports web, which is the gate here: the same codebase is
the website. `react-native-track-player` is the usual suggestion and solves a
different problem (queues, lock-screen controls, background playback) at the cost
of replacing expo-audio and risking the web build. The only piece actually
missing was a slider, and `@react-native-community/slider` is the standard one
with a real web implementation.

What the controls are:

- **A scrubber**, showing the length before anything is downloaded (from the
  row's `seconds`) and the real position after. It is disabled until a file is
  loaded, because there is nothing to seek in — but it is still drawn, since
  "how long is this" is a question worth answering before pressing play.
  While a finger is on it, `scrubbing` holds the thumb: the status keeps
  reporting the real position four times a second, and letting that drive the
  slider makes the thumb fight the finger.
- **−15s and +15s**, clamped to the recording. The podcast default, and muscle
  memory.
- **One speed control**, cycling 1× → 1.25× → 1.5× → 2× → 0.75×. A cycle rather
  than a menu: a menu is a second surface to open on a control most people press
  once. It is re-applied after every `replace`, because a new source starts at
  normal speed and the choice would otherwise spring back on each reload. Pitch
  correction is on — 2× speech without it is a chipmunk.

The button's colour is the whole of what it says at a glance: **accent** when
there is no recording and pressing makes one, **green** when there is one to
play, **red** when the last attempt stopped and the reason is underneath. Pending
keeps the accent and shows a spinner.

One player for the life of the card, fed by `replace()` — `useAudioPlayer(source)`
builds a *new* player whenever the source changes and releases the old one, so
passing state into it and calling `replace` as well tears the player down
mid-press.

**Never touch the player from an effect cleanup.** `useAudioPlayer` releases it
in its own cleanup, which was registered first and so runs first, and a released
shared object throws on every call after that — "no longer associated with its
native counterpart". A throw inside an unmount cleanup is nobody's to catch: it
is a red screen in development and the app dying in a release build, on the
ordinary way out of a card. That is what a `player.pause()` in the cleanup keyed
on the card did, and why the reset is now done on the way *in*, by comparing the
card key to the one the player was loaded for. Nothing has to stop the audio on
unmount: releasing the player is what stops it.

**The screen stays on while it plays** (`useScreenAwake` in
`apps/mobile/lib/awake.ts`). A card runs for minutes with nobody touching the
phone, so the display goes out and the phone locks in the middle of the one
feature whose point is that you are not looking at it. The lock is held only
while something is actually playing — held for as long as a card is open, it
would sit on the battery of a phone left on a table — and it is re-taken when the
app comes back to the foreground, because a browser drops the wake lock the
moment a tab is hidden and never gives it back on its own. Every call is wrapped
in a catch: a browser without the Wake Lock API, one refusing it in the
background, and releasing a lock that was never taken all end in the screen
behaving the way it always did, which is not worth a message.

`isLoadedRecordingCurrent` in `packages/domain/src/audio.ts` decides resume
against reload, and lives in the domain package with tests because getting it
wrong reads the wrong card out at somebody. What is loaded stops being current
when the server has a different `madeAt` (the card was written again), when the
server has nothing ready (it is being made again, or it failed), or when the
signed link has passed its hour — a recording is streamed, so an expired URL
stops it partway through rather than failing on the press.

`status.isBuffering` is deliberately **not** part of the disabled state: an 11 MB
WAV rebuffers through most of a playback on mobile data, and a disabled button
there is a pause control that ignores taps.

When a run finishes while the card is still on screen and it was this press that
started it, the player tries to play. Attempted rather than assumed: a browser
may refuse to play outside the gesture that asked, and the green button behind it
is the answer when it does.

## Costs and limits

The most expensive press in the product — a model call plus minutes of
synthesised speech billed by the audio second. `assertNarrationBudget` is the
tightest ceiling there is, and it counts **runs started rather than rows**:
there is one row per card, so a card that failed on every press would otherwise
be retryable without limit against a counter that could never grow. Each claim
increments `attempts`, and the budget sums those over rows claimed inside the
hour.

CloudFront's 60s origin read timeout is why the press and the run are separate:
nothing holds a request open for a generation any more. The app no longer calls
the API through the edge at all (doc 7), but minutes of synthesis would outlast
any request deadline worth having.

**Nothing deletes an object.** A re-recording overwrites its own key, but a
deleted node, a rebuilt map and a bumped revision all leave objects behind. There
is no lifecycle rule, because expiring a recording silently costs a model call to
get it back. The fix is a sweep by prefix, and it needs `s3:DeleteObject` the API
user deliberately lacks.

## Configuration

Everything is optional in `env.ts`. A deployment with no `AUDIO_BUCKET` serves
every route and fails only the press, naming the variable that is missing.

```
LLM_AUDIO_MODEL   default gemini-3.1-flash-tts-preview
AUDIO_BUCKET      the private bucket; no public access, signed GETs only
AWS_REGION
AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
```

Those last two are the **API's own** IAM user (`interestled-api`), which can put
and get objects in the audio bucket and nothing else in the account. They reach
the env file through the `API_AWS_*` repository secrets — not the deployer's key.
See `deployment/terraform/audio.tf`.

## Where to look

```
apps/server/src/narration.ts                 the claim, the run, and the staleness rules
apps/server/src/audio/wav.ts                 PCM → WAV
apps/server/src/storage.ts                   the ObjectStore seam and the S3 one
apps/server/src/llm/speech.ts                the SpeechProvider interface
apps/server/src/llm/gemini.ts                createGeminiSpeech
apps/server/src/llm/prompts/narration.md
packages/schemas/src/audio.ts                the key, the revision, NodeAudio
packages/schemas/src/voices.ts               NarrationVoice and the default
packages/ui/src/copy.ts                      VOICE_COPY, VOICE_OPTIONS, VOICE_NOTE
apps/mobile/app/topic/[topic]/edit/content.tsx  where the voice is picked
packages/domain/src/audio.ts                 isLoadedRecordingCurrent
packages/api/src/hooks.ts                    useNodeAudio, and the polling while pending
apps/mobile/components/CardAudio.tsx         the player and its controls
apps/mobile/lib/awake.ts                     the screen staying on while it plays
```
