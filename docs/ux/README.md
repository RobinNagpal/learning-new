# UX for Learning Any Topic Fast

Content used to be the expensive part of a learning product. With an LLM backend it is
not — you can generate any explanation, at any depth, for any learner, on demand. What
stays hard is showing the right thing, in the right order, and making sure it lasts.
Those are interface problems, so **the UX is now the product.**

**In here:** what we are fixing, 8 ideals, the loop, 18 building blocks (each with a
site you can go and look at), 5 topic archetypes, 5 worked examples, a coverage table,
and the backend contracts. About 25 minutes end to end, and every section stands alone
if you only want one.

Its companion, [adhd-learning-guidelines.md](./adhd-learning-guidelines.md), sets out
what keeps an ADHD learner engaged and what loses them. Everything here is built to
satisfy it, and the [coverage table](#how-this-covers-the-adhd-guidelines) shows where
each of its 40 points is met. **W1–W20** refers to its twenty things that work,
**A1–A20** to the twenty that do not.

That constraint improves the product for everyone. Designing against the least
forgiving attention in the room is a good way to find what was never really working
for anybody.

---

## What we are fixing

**Chatbots feel great and teach very little.** You only get answers to questions you
already knew to ask, so the shape of what you don't know stays invisible. Nothing
carries over between turns, which means turn forty has no idea what you understood at
turn three. And nothing ever asks you to produce anything, so nothing gets encoded —
reading a fluent explanation feels exactly like knowing it, right up until you have
to use it.

**Courses have the structure chatbots lack and pay for it elsewhere.** The sequence is
fixed, so a backend engineer and a product manager both start at Module 1. Reaching
the one thing you actually needed means walking the whole tree. And the granularity is
wrong: a 22-minute video cannot be asked a follow-up, and you cannot re-watch only the
forty seconds that mattered.

We want the structure of a course, the responsiveness of a chat, and the memory
mechanics of flashcards.

---

## The ideals

These eight are the load-bearing decisions. They are medium-independent — each would
hold for a textbook, a private tutor or a classroom, and none of them needs an LLM.
The LLM only makes them cheap enough to do for every learner instead of for one.

Each ideal below states what it rules out, because an ideal you cannot violate-test is
decoration. If a screen breaks one of these, that is a bug rather than a trade-off.

### 1. The learner can always see the whole, and where they are in it

Ask someone studying alone what they do not know yet and they cannot tell you, which is
the actual problem — you can only ask about gaps you can already see. A visible map
solves that in one move, because it turns "I should learn Kubernetes" into twenty-four
named things, six of which are already done. The finiteness is doing most of the work
here: a shrinking list behaves completely differently from an open-ended intention.

It also makes the *shape* of the subject visible, and knowing the shape of a field is a
large part of what expertise actually is. The catch is that the map has to be honest,
because the moment progress can be faked by scrolling, the whole thing becomes
decoration.

- *Rules out:* any indicator that advances on consumption, and any "68% complete" of a
  total the learner cannot see.
- *Seen in the wild:* **Google Maps' route view.** The whole journey and your position
  on it, permanently, and it is the *remaining* distance that tells you whether to
  stop for petrol.
- *Covers:* W7 (move freely), W19 (concrete progress), A16 (vague numbers).

### 2. One thing is in front of them at a time

A screen holding a map, a chat, a quiz and a diagram looks generous and reads as noise.
Everything visible competes to be selected, and that selection cost comes straight out
of the attention the material needed.

The counter-intuitive part is which extras cost the most — the interesting ones, because
they win the competition, which is why dropping something fun into a dense explanation
usually makes the explanation worse. So: one concept, one visual, one action, and
everything else collapses or dims until it is wanted.

- *Rules out:* related-links panels during a node, badge counters, tip boxes, and any
  second visual whose job is to "support" the first.
- *Seen in the wild:* **iA Writer's focus mode**, which dims every sentence except the
  one you are working on. Nothing is removed — it is simply made to stop competing.
- *Covers:* W13 (one thing at a time), A13 (clutter), A1 (long unbroken text).

### 3. They produce rather than receive

Reading a good explanation and understanding it feel identical from the inside, and that
is the most expensive illusion in learning — it holds right up until you have to
generate a sentence and discover you cannot. Production breaks the tie, because it
forces retrieval and retrieval is what actually strengthens the memory.

So every node ends in something written, said, chosen or built, and no amount of reading
can mark one as known. This is also what keeps the map honest, which means ideals 1 and
3 stand or fall together.

- *Rules out:* a "mark as complete" button, nodes that advance on scroll, and multiple
  choice standing in as the assessment.
- *Seen in the wild:* **Exercism**, where the unit of work is a failing test you have
  to make pass. Reading material is available, but it is never the thing being tracked.
- *Covers:* W8 (hands and mouth busy), W19 (progress means production), A7 (retrieval
  rather than transcription).

### 4. They commit before they are told

There is a large difference between being handed an answer and discovering you did not
have it. An attempt made first creates a specific gap, wakes up the related knowledge,
and stakes a prediction that the explanation can then confirm or correct. Told first,
that same explanation lands on nothing and slides off.

Being wrong carries no cost here — the error is what marks the spot the correction
should land on. One rule keeps the whole thing working: the guess is never scored,
because a graded guess stops being an honest guess immediately.

- *Rules out:* revealing a chart, an output or a result before asking what the learner
  expects, and attaching any score to something labelled a prediction.
- *Seen in the wild:* **Kahoot.** Everyone locks an answer in before the distribution
  and the correct one appear, and the reveal is gripping precisely because you already
  committed to something.
- *Covers:* W14 (ask before explaining), W15 (surprise), A2 (the payoff sits inside
  the unit).

### 5. Depth belongs to the learner, sentence by sentence

The same node has to serve someone skimming before a meeting and someone who wants the
derivation, and which of those they are changes inside a single session — sometimes
inside a paragraph. Asking at signup gets it wrong for both and then stays wrong.

Putting the control on every card fixes that, and it buys a second thing worth as much:
you can now write above comfort, because anyone who needs less can press *simpler*
rather than being written down to by default. Pre-generating the variants is what makes
people actually press the button, since a depth control that costs a wait goes unused.

- *Rules out:* a difficulty setting in preferences, separate beginner and advanced
  tracks, and writing every card for the least-prepared reader.
- *Seen in the wild:* **Stripe's API reference**, where nested object fields expand
  only when you ask for them. The same page is a summary or an exhaustive spec
  depending on what you click.
- *Covers:* W17 (err fast, depth on demand), A4 (a shorter version instead of a gate),
  A15 (no sitting through the known part).

### 6. Level is measured, never asked

"How would you rate your Kubernetes?" produces a number that means nothing, because
self-assessment is unreliable and the honest answer is usually "depends which part".
What someone writes, though, is evidence: the vocabulary they reach for, the mistakes
they make, the branches they skip. That evidence is more accurate than any dropdown and
it costs the learner nothing, because it comes out of work they were doing anyway. It
also keeps getting better, where an answer given at signup is stale within a week.

- *Rules out:* level dropdowns, self-rating sliders, and any personalisation that
  depends on the learner describing themselves accurately.
- *Seen in the wild:* **provisional ratings on Lichess and Chess.com.** You never
  declare how strong you are — you play a handful of games, the system works it out,
  and the matchmaking follows.
- *Covers:* W18 (skip the known), A14 (no forms before starting), A18 (the estimate
  tracks the current session, not a stale self-report).

### 7. Nothing important lives only in their head

Working memory is small and empties easily, so every rule, value or goal the learner has
to hold is capacity taken away from the thinking. The expensive version is information
that must be combined but is presented apart — a formula on one screen, the exercise on
another — because then the effort goes into carrying things back and forth instead of
using them.

The fix is unglamorous: repeat rather than cross-reference, keep the current question
written where the work is happening, and put anything used together into one visual
field. Printing a formula twelve times costs twelve lines; sending the reader back for
it twelve times costs the thread every time.

- *Rules out:* glossaries you navigate to, drills that reference a value from an
  earlier card, and multi-step instructions delivered in a single sentence.
- *Seen in the wild:* **frozen header rows in Google Sheets.** Scroll to row 400 and
  the column names are still there, so you never have to remember what column G meant.
- *Covers:* W9 (everything in view), A11 (one instruction at a time), A12 (nothing
  carried across screens).

### 8. Speed is part of understanding, not an engineering nicety

An eight-second load does not merely annoy — it decides how much of the subject gets
explored, because exploration only happens while it is cheap. If pressing *deeper* costs
a wait, people stop pressing it, and the depth control that was the entire point of
ideal 5 quietly ceases to exist.

The same holds for a model that takes forty seconds to rebuild: nobody tries the stupid
parameter values, and the stupid values are exactly where the intuition was hiding. So
stream everything, skeleton everything, and build the next screen while the current one
is still being read.

- *Rules out:* spinners, blocking loads between nodes, and any interaction where a
  second attempt costs as much as the first.
- *Seen in the wild:* **Linear**, which treats sub-100ms response as a product
  requirement rather than an optimisation — and where the speed visibly changes how
  much people move around inside the app.
- *Covers:* W11 (momentum never waits), A10 (dead time).

---

## The loop

The eight ideals describe what has to be true. This is the shape that makes them true
in practice — one cycle that every topic runs through, whatever the subject.

```
MAP     what exists, what I know, what is next
  ↓     pick a node
FOCUS   one concept, one screen, depth buttons
  ↓     now prove it
DRILL   explain it back, predict, debug, translate → targeted feedback
  ↓     result updates the map
RECALL  short daily mixed review; failures reopen the node
```

Three rules keep the loop honest.

- **One trip takes three to eight minutes.** Small units mean frequent finishes, and
  finishing is the only reward on offer before mastery arrives. *(W2)*
- **Reading cannot complete a node** — only production can. Break this and the map
  starts lying, which collapses ideal 1. *(W19)*
- **The system picks what gets reviewed**, not the learner, because nobody
  volunteers to review the thing they are worst at.

**Layout:** a map rail on the left, one thing on the main stage, and an ask box on the
right that is scoped to the current node. Answers appear inline, so a question never
costs the learner their place — and any answer can be promoted into a new node, which
means curiosity grows the map instead of derailing the session.

---

## The building blocks

Each block below has four parts: what it is and why it works, the general ideal
underneath it, a site you can go and look at to see the visual effect done well, and
which ADHD requirements it satisfies. The examples are there to show the *effect*, not
to endorse the product — several of them get other things badly wrong.

### Calibration probe

Asking someone to pick Beginner, Intermediate or Advanced produces a number that means
nothing, because people judge their own level badly and the honest answer is usually
"depends on the sub-topic". So ask about the work instead of the rating. Sixty seconds —
what do you want to be able to do with this, where are you now and where do you want to
get to, how much time do you have — sets depth, vocabulary and scope better than any
self-report.

The two long answers are boxes asking for points, not single lines. "Deploy a service"
and "debug it at 3am" are different goals, and one line quietly asks people to pick one
of them. *Where are you now, and where do you want to get to* is the highest-value
answer in the product: the first half decides which comparisons land and which whole
branches can be deleted before the learner ever sees them, and the second decides where
the map is allowed to stop, which is the difference between twelve nodes and forty.

Some of it is not per-topic at all. Age, what they already know at a high level, and
how they want things explained are true of the learner rather than of the subject, so
they are asked once on the profile screen and read by every generation call after that
— the calibration that does not have to be repeated per topic. All of it is optional:
a learner who never opens that screen gets the same product, and a required form
between signing up and the first node is exactly the setup cost A14 bans.

**Then seven choices, which the form cannot get at.** The probe says what someone
wants; it does not say what the map should look like, and nobody can write that down —
"cut it up by what breaks rather than by component" is not a sentence people produce on
demand, and it is a decision they make in two seconds when they can see both. So the
model writes seven questions with four options each, and each option is a *sample*: the
actual headings, an actual example, the actual first two sentences of a node. The
learner reads four samples and picks — as many of the four as they want, because two
cuts of a subject can both be wanted and blended, and forcing one throws away half of
what they meant. Which set of top-level headings, how the biggest one breaks up, what to
leave out, what an example looks like, how much code, how many numbers, how a node
opens. What they passed over goes to the model as well as what they picked: the four
options were only ever meaningful against each other.

One question per screen, every one skippable, and a skipped question is absent from the
prompt rather than answered with a default. A full rebuild asks them again, because the
map they describe is the one being replaced; a group rebuild does not, because it is
not changing the shape of the whole.

**Then one screen holding all of it, and the button.** Everything the map is about to be
built from — the three answers, the shape, the lines the model is given, the seven picks
— is on one page, each of them changed where it stands, with *build the map* underneath.
It is worth a screen because the build is the one decision nobody can correct afterwards
except by throwing the whole map away, and until it existed the answers were spread over
a form and a sheet and were never visible together. It also survives the build failing:
none of it is held by the screen, so a model error, a quota, or a request the CDN gives
up on leaves the learner exactly where they were with one button to press again, rather
than answering seven questions for a map they had already asked for.

- *The ideal:* diagnose before you instruct, and spend the diagnosis on what they can
  already do rather than on how they rate themselves.
- *Seen in the wild:* **Duolingo's placement test.** It does not ask how good your
  Spanish is; it gives you a short adaptive test and drops you at the right point on
  the path. Copy the shape — a few real tasks, then a decision — not the length.
- *Covers:* W18 (skip what they know), A14 (setup before starting — this must feel
  like the product starting, not like a form).

### Knowledge map

The map is the first thing on screen and the reason the whole thing works. Fifteen to
forty nodes with dependencies drawn between them, each carrying a status: untouched,
seen, explained, verified, due, or shaky. It gives the subject a visible shape and a
visible end, and the shape of a subject is a large part of what expertise actually is.

**The map has levels.** A flat list of thirty nodes is a list, not a shape, so the map
is built as groups with the nodes inside them — two levels by default, three for a
subject too wide to sit under eight headings. The learner is asked which on the form the
map is built from, beside the heading counts it decides the meaning of, because it is a
question about the map rather than about them and it only matters at that moment. A group is a heading and nothing more: no card, no
drill, no minutes of its own, and nothing counts it as progress — its time is the sum
of the leaves under it, and collapsing one is what keeps a wide subject something you
can still see the whole of.

**Every node has its own address**, built from titles rather than ids:
`/topic/kubernetes/scheduling/taints`, and `.../drill` for the drill. A slug is unique
among its siblings, so the URL reads as the trail down to the node and a link sent to
someone else lands exactly where it says.

**The map is editable, because the first one is rarely quite right.** Reading a map is
what tells you what is missing from it, and a product whose only answer to "nearly
right" is regenerating everything throws away every node already verified. So the map
screen has an edit mode: move a row among its siblings, delete one, and rebuild any one
group — in the learner's own words, "less YAML, more networking" — leaving every other
group and all the progress on it untouched. Rebuilding the whole map is there too, and
says plainly that it replaces everything.

**The map's edit screen says what the map was built to**, folded away above the rows: the heading
counts, the sitting, how far into the subject it goes, and the instruction lines the
model was actually given — the learner's own if they wrote them, the ones the settings
seed if they did not. It is closed by default, with the shape on the closed row, because
the map is what the screen is for. Someone reading a map that is nearly right cannot say
what to change without the answers it came from, and the only other place those answers
appear is inside the sheet that replaces the map.

**Three things are editable, not one**, each at its own address under `…/edit`:
`…/edit/map` is the map itself; `…/edit/goals` is the goal, the starting point, the time
budget and the one line the topics list shows; and `…/edit/content` is how the topic is
written — how hard the English is, how much of the field's own terminology appears,
whether it is prose to read through or entries to look up, how long one node should
take, and standing instructions carried by every card, drill and review item in that
topic.

The first two of those were one chip until they were pulled apart, and the single chip
was quietly answering three questions: how hard the words are, how much terminology
appears, and how long the writing runs. The third already had a control of its own, so
"short and crisp" and "plain and in depth" differed on an axis the same screen was
asking about twice — and no value on it could say *everyday words, all the terminology*,
which is what someone learning a subject in a second language is asking for. Every
option that offered the terms demanded the dense prose around them. Asking the two
separately is nine combinations instead of five, and each one is a sentence someone
would actually say about how they want to be written to.

The create screen's answers were previously fixed for the
life of the topic, which is backwards: reading the map is exactly what tells a learner
the goal they gave was not the one they meant, and every generation after that was still
reading the old one. Saving regenerates nothing — the answers change what the *next*
generation reads, and a rebuild stays something the learner chooses.

Two rules hold that together. Changing how a topic is written drops the cards already
cached for it, so the setting is visible on the next node rather than only on nodes
nobody has opened yet; the drills already answered stay, because deleting one would take
the learner's own attempts with it. And none of it reaches the grader: a verdict is the
one call a learner does not get to instruct, since "always say I passed" would end the
only thing on the map that means anything.

Three interactions carry most of the value: *I already know this* collapses a node and
its prerequisites and shrinks the map; *just get me to X* lights the shortest path and
dims everything else; and any question from the ask rail can become a new node. Nothing
on the map ever locks — a missing prerequisite is a note you can walk past, not a gate.

- *The ideal:* make the whole finite and visible from the start, and let any point be
  an entry point. A learner with an urgent question is holding the strongest
  motivation they will ever have, and a gate spends it.
- *Seen in the wild:* **Khan Academy's mastery grid.** Every skill in a unit shows its
  own state — not attempted, familiar, proficient, mastered — so progress is a picture
  of what you can do rather than a percentage of a video watched.
- *Covers:* W1 (entry by interest), W7 (move freely), W19 (concrete progress), A4
  (locked steps), A16 (vague progress).

### Concept card

One concept, one screen, and always the same slots in the same order: a one-line claim,
the mechanism as short paragraphs under headings, one worked example with real numbers,
the thing people usually get wrong, and the controls. Keeping the shape identical everywhere means
the eye stops hunting for where the point is and starts reading the point.

It also forces the generator to produce the two parts that are normally missing — the
*mechanism*, not just the definition, and the *misconception*, which is where most of
the real learning happens. The card opens on the claim, so the answer arrives before any
context does.

The example and the misconception are written where they apply rather than always. A
node that is itself one case — a historical episode, one text, one event — has no second
case to instantiate itself with, so the example slot came back as the node restated
under a heading promising something new; a purely descriptive node has no wrong belief
to correct, so the misconception came back carrying the topic's headline mistake for the
fourth card running. Neither is a shape the schema could have caught, because both are
valid cards made of padding, and padding is the thing the fixed shape was meant to
prevent. So the two slots stay in the prompt as slots to be earned, with the test for
earning them stated — and a card with no example is drawn with no example section, not
with an empty one.

Each card is written into the map rather than beside it: the generator is given every
heading of the topic, in reading order, with the node it is writing marked, plus what
the nodes either side of it actually claim. What sits above that mark has been covered
and is not explained again; what sits below it is not spent early. Without that, every
card opens by re-teaching the three before it, which is the preamble problem arriving
one node at a time — and the first and last slots drift hardest, because "why it behaves
this way" and "what people get wrong" both pull towards whatever the topic as a whole is
about. Nothing true of the whole topic may sit on one node of it: if a sentence would
serve a neighbouring node equally well, it belongs on neither.

The mechanism is headed sections — a short paragraph with a name over it — because a
ten-minute card was otherwise thirty unlabelled paragraphs running down the screen with
nothing to navigate by, and a reader who looks away loses their place with no way to
find it again. A heading every forty-five words would be a glossary; at eighty there is
a paragraph under each one worth giving a name to.

The slots are also one explanation rather than separate notes about the same subject.
The sections run in order, each starting from what the one above it established; the
example is that mechanism happening on one case, in the same words for the same things;
the misconception is a belief a reader could still hold having read both, corrected by
pointing back at the step that rules it out. Two habits break this, and both had to be
named explicitly. A heading is the step of the argument the paragraph makes, not the
name of a term: headings like *Central bank monetization* turn the card into a list of
definitions, and the paragraphs under them stop needing each other, which is the same
failure the old ban on gluing a name to a sentence was guarding against when there was
nowhere else to put one. And "delete recaps and transitions" (A17) is about the three
minutes of *last time we covered*; taken as a ban on the half-clause that joins two
sentences, it produces exactly the disconnected fragments the guideline exists to
prevent — inside a section as much as between them. Cards are cached forever, so
changing any of this reaches nobody until the prompt revision in the cache key moves.

How long a card runs is the learner's setting, not a constant. Ten minutes a node means
roughly two thousand words, of which four fifths are the mechanism — it is the slot that
explains, so it is the slot that gets the time. That share divided by what one section
is written to (a heading and two to four short sentences, about eighty words) is the
number of sections asked for, because a fixed count and a fixed section length between
them already decide how long a card is: naming a read time as well was asking for three
things that cannot all be true, and the read time was the one that gave way. Length
therefore still arrives as more sections rather than longer ones — a wall of text is not
made readable by being one of five instead of one of twenty. Changing the setting moves the map's own minute estimates with it,
scaled so a node the model judged twice its neighbours stays twice its neighbours: a
card written to ten minutes under a map still promising three is the map lying about
time.

What comes back is Markdown, and it is drawn as Markdown — `kubectl get pods` set as
code, a list of parallel items set as a list. The alternative is the marks themselves on
the screen, which is the app showing its working.

- *The ideal:* a fixed, predictable structure removes a cost the reader is otherwise
  paying on every page, and the fixed slots force the author to write the hard parts.
- *Seen in the wild:* **Bartosz Ciechanowski's explainers** (bartoszciechanowski.com,
  on gears, cameras, GPS). Every section is short, every one carries exactly one
  manipulable figure, and the structure repeats so consistently that you stop noticing
  it — which is the point.
- *Covers:* W13 (one thing at a time), A1 (long unbroken text), A5 (no preamble), A13
  (one visual, nothing decorative).

### The controls under a card

Everything that decides how a card comes out sits under it: how deep it goes, how long
it takes to read, how hard the English is, how much terminology it carries, whether it
is prose or notes, how long a paragraph runs, and which angle it is written from. Seven
rows of chips is a second screen under the first, and most readers want none of it most
of the time — so it is
folded away, and the closed row says what the card in front of them was written to:
*How this card is written — depth 3 of 5 — the mechanism · about 5 min · medium
English · some detail*. That is the difference between a panel and a drawer labelled
*Settings*: a drawer has to be opened to find out whether it holds anything you want,
and this one answers the question from outside. It is also the only place the settings
a card was actually written to are stated once the card has arrived.

Opened, it is the topic's own settings screen again — the same rows of chips, in the
same order, out of the same copy, with the one that is in force on this card filled in.
Depth and angle are the two a card has and a topic does not. The rows were a mix before:
*simpler* and *deeper* beside *shorter* and *longer*, four buttons that could move a
setting but never say where it stood, so half of each scale was somewhere the reader had
to press twice to find out about, and the two ends did nothing at all. A chip row says
what the card was written to and what else it could have been in the same glance, and it
says it in the shape the settings screen already taught.

Moving a chip writes nothing. It used to write a card on the spot, which made a second
change a second wait and a second model call, and meant nobody could set the depth and
the length together without paying for the card in between — the one nobody asked for.
So the chips move the panel and the panel alone, and one button under them asks for the
card: *Regenerate*. What is on screen stays on screen until it lands, and the closed row
says *not written yet* while the two disagree.

At settings the card was not written to, that press asks for that card — which the cache
may already hold, in which case it costs nothing. At the settings it already has, the
same button reads *write it again* and always costs a model call: generation is not
deterministic, so the same request twice is a different explanation, and the only way to
ask for one used to be moving a setting somewhere you did not want it and back. That is
why the cards written in an hour are capped per learner — every other generating call
either creates nodes or is answered from the cache the second time round, and this one
has no ceiling of its own.

*Back to how the topic is written* moves every chip back to the topic's own settings,
and like every other control here it is a request until the button is pressed.

Under the chips is the one control that is not a chip: a box for what this card in
particular should do, in the reader's own words — *compare it with how Postgres does
it*, *use an example from banking*. It is kept with the node, so it is there again the
next time the card is opened and holds for the next writing too, and it goes to the
model after the topic's standing instructions with a note saying which wins. Like the
chips, typing in it writes nothing; the button under it does.

Changing the topic's settings never writes a card either. It used to: the cards were
dropped, and the next open of every node was a model call and a thirty-second wait,
whether or not the reader wanted that card different — which is the wait A10 forbids,
paid on every node for a setting moved once. Now a node whose card was written to the
old settings answers with that card, and the closed row says *the settings have moved
since*. Opened, the panel states both sides — what the card was written to, and what
the node now asks for — and the same button writes it again. The same holds when the
reader's own depth has moved on, and when the box above was edited: the card on screen
is always the card they have, and the panel is always honest about what it is.

### Listening to a card

A play button sits under the claim, above everything else on the card, because
listening instead of reading is a decision somebody makes before they start rather than
after they have given up. What it plays is not the card read out. A card is written to
be looked at — it has formulas in it, snippets, exact figures — and a machine reading
those aloud says every backtick and spells out every symbol, which is worse than
silence. So the first press writes a script first: what a person would say if they were
reading the card with the learner in front of them, pointing at it as they went. *The
formula under 'How the rate compounds' — the balance times one plus r, all to the power
n.* *The second line of the snippet is where the lock is taken.* The card stays on
screen, and the words point at it.

That costs two model calls and a stretch of synthesis, which is far too long to keep
anybody waiting on a request — so the press starts it and says so, the button spins,
and the screen keeps working while it runs. It goes green when there is something to
play, and red with the reason when it stops. Once there is a recording the row becomes a
player: a bar showing how long it runs and where you are in it, fifteen seconds back or
forward, and a speed control for the dense minute you want to hear twice at 0.75 or the
one you want to skim at 2.

The script and the audio are kept together, keyed on the card they were made from — not on the node, because a node has a
card per setting and the recording is of the one being read, which is why the play
button says which card it is on rather than letting the server guess. The file goes into
a bucket under a path built from the same slugs the URLs are built from:
`robin/kubernetes/scheduling/taints/…`. The second press is a download.

Pressing *write it again* on the card below retires the recording along with the text it
was of, and nothing is made in its place: asking for a card to be written again is not
asking to be read to. The button goes back to offering one, and a player part-way
through the old recording stops offering to resume it — reading out words that are no
longer on the screen is the one thing this feature must never do.

Who reads it is a setting on the topic, chosen once on *How it is written* and never
asked at the moment of listening. Eight voices, each with a line saying what it sounds
like, and Erinome — clear and unhurried — until somebody picks another. Eight rather
than the thirty the provider offers, because a card is an explanation rather than a
performance: the excitable and the gravelly are fine for a minute and wear through a
session. Changing it does not go and re-record anything. It means the recordings the
topic already has stop matching what it now asks for, so each one is made again in the
new voice the next time that card is played — and the note under the chips says exactly
that, since a setting that quietly costs a wait later is a setting nobody trusts twice.

- *Covers:* W5 (a different channel for the same content), W8 (hands free while it
  plays), A1 (a card that reads as a wall can be listened to instead), A10 (the wait
  is never dead time — the press answers at once and the card stays readable while
  the recording is made), W16 (the voice is chosen on a settings screen, away from
  the moment of doing, and there is a default so choosing is never the price of
  starting).

### Asking about a card

*Ask*, in the bar over every card, opens a sheet with one box in it. The answer comes
back as one paragraph the length the card's own paragraphs are — the *how long a
paragraph runs* setting, so it reads as part of the card rather than as a different
voice — written against the card on screen, with the map around it, so it points at a
section by name rather than repeating it and says which node covers a thing that is not
this one's. The question and its answer are kept with the node and shown on the card
under *What you asked*, each answer folded behind its question, the newest open. A
question answered and then lost is the glossary problem again: a trip that has to be
made twice (A12). An answer is one model call per press and nothing else bounds it, so
questions in an hour are capped per learner, the way rewrites are.

The wait now says what is being written — *depth 3 of 5 — the mechanism · about 3 min ·
medium English · some detail*. Ten to thirty seconds against a label saying only that
something is happening is a wait nobody can tell from a hang, and it is the one moment
the settings screen's answers are visible anywhere in the product. The rule turning a
topic and a node into those settings is shared between the server and the app rather
than written twice, because a wait describing a card other than the one that arrives is
worse than a wait describing nothing.

Depth is sticky: ask a few cards for a deeper one and later cards start deeper, so the
learner sets their level by using the product rather than by declaring it. Cards are
cached per setting, so returning to one is instant — and while a new one is being written
the old one stays on screen with *writing it…* beside the controls, because blanking the
screen to a skeleton for twenty seconds is the other way a working control reads as a
broken one.

- *The ideal:* pitch slightly above comfort and make the depth available on demand.
  Writing for the least-prepared reader holds everyone at the slowest pace in the room
  and loses the rest.
- *Seen in the wild:* **Wikipedia's Simple English edition.** The same article at two
  depths, one click apart. The lesson to take is that the depth switch belongs next to
  the content, not in a settings page.
- *Covers:* W17 (err fast, with depth on demand), A4 (a shorter version instead of a
  redirect), A15 (someone who knows this moves up rather than sitting through it).

### Explain-back

"Now say it in your own words." This is the highest-yield drill in the product, and
the reason is that fluent reading produces a very convincing feeling of understanding
that survives right up until you have to generate a sentence. Do not score the answer.
Return a diff against a reference decomposition of the node:

```
✓ Got:     the causal direction
△ Vague:   "makes it faster" — faster than what, and why?
✗ Missing: the constraint that makes this needed at all
✗ Wrong:   B causes A here, not A causes B → [correction + one example]
```

The diff is usable in the next ten seconds, where a score is only a verdict. It also
hands you the learner's misconception phrased in their own words, which is the best
input any future explanation could have.

- *The ideal:* feedback is about the work, specific, and attached to an immediate next
  attempt. A third of feedback interventions make performance worse, and
  person-directed feedback is the main culprit.
- *Seen in the wild:* **Lichess and Chess.com game review.** Each move gets classified
  and the better line is played out beside it, so you see what you missed rather than
  a mark out of ten. Note that the analysis is free of any rating consequence — that
  separation is deliberate and worth copying.
- *Covers:* W8 (produce), W6 (fast feedback), A17 (harsh marking), A7 (retrieval
  instead of transcription).

### Predict, then reveal

Before any chart, any command's output, any result — get a commitment. A guess, a
number, a drawn line, a chosen outcome. Then reveal, and explain the gap by name:
"you expected the gain to settle it faster; it overshoots, and the piece your model
left out is momentum." This is the cheapest high-value pattern in the whole document,
it can be layered onto almost every other block, and the guess must never be scored —
a graded guess stops being an honest guess and the mechanism dies with it.

- *The ideal:* an attempt made before the explanation creates the specific gap the
  explanation fills. Getting it wrong is not a cost; the error marks where the
  correction should land.
- *Seen in the wild:* **The New York Times' "You Draw It" interactives.** You drag a
  line across the chart to say what you think happened, and only then does the real
  series appear over your guess. People remember their own wrong curve for years.
- *Covers:* W14 (ask before explaining), W15 (surprise), A2 (a payoff inside every
  unit rather than at the end).

### Playground

Some ideas are relationships between quantities, and no amount of prose transfers a
relationship as fast as ten seconds of moving a slider and watching the curve answer. So
give one to three parameters and a live picture — not a simulation of everything, just a
knob and a consequence.

The response must be on the same frame as the drag: if the model takes forty seconds to
rebuild, nobody explores, and exploring is where the intuition was going to come from.
The LLM does not run the simulation; it picks a widget from a fixed library and sets its
parameters.

- *The ideal:* let people manipulate the thing rather than read about it, and make the
  manipulation cheap enough that they try the stupid values too.
- *Seen in the wild:* **Desmos.** Add a slider to a graph and drag it, and the curve
  moves as your finger moves. **Setosa.io** applies the same effect to statistics —
  eigenvectors, conditional probability — where the payoff is even larger.
- *Covers:* W5 (a different channel), W8 (hands busy), W10 (fast event rate), A10
  (latency inside the work itself).

### Timeline

Historical and evolutionary topics are causal chains running through time, and a
horizontal time axis is the only layout whose geometry matches that. Drag the scrubber
and the panel below shows what was happening, what people believed at the time, what
they did, and what it cost. Two synced tracks work well — the measured series above, the
decisions below.

Then the drill this layout makes possible: stop at a decision point and hand it over.
*"You are the Fed chair in October 1979. Here is what is known. What do you do?"*

- *The ideal:* order material as a causal chain rather than as a taxonomy, because
  when elements are linked by cause, remembering one pulls the next one with it.
- *Seen in the wild:* **Our World in Data.** Every chart has a time slider and a play
  button, and moving through the years yourself produces a sense of the trend that
  reading the same trend never does.
- *Covers:* W15 (causal order), W14 (the decision stop is a prediction), A1 (a
  timeline where a narrative would have been).

### Compare table

Most confusion in a technical subject is not "I don't know X" — it is "I can't separate
X from Y". Contrast resolves that faster than any amount of further explanation of
either one.

So watch for the conflation in the learner's own explain-back, and when it shows up,
generate a side-by-side with rows chosen for decision relevance rather than for
symmetry: *"you are using Deployment and StatefulSet interchangeably — here are the
three differences that change what you would write."* Firing on detected confusion is
what makes this feel like the system is paying attention rather than like a reference
page.

- *The ideal:* teach the distinction at the moment the learner reveals they have
  merged two things, using the smallest number of rows that would change a decision.
- *Seen in the wild:* **Wikipedia's "Comparison of…" tables.** A dense grid, one row
  per property, no prose. The lesson is that the table itself is the explanation and
  needs no paragraph around it.
- *Covers:* W9 (both things in one visual field), A12 (no flipping between two pages
  to compare).

### Broken thing to fix

Expertise is largely a library of failure modes, and diagnosis is what the job actually
consists of. So the most valuable screen in a technical topic is a broken artefact and
the question *what is wrong and why* — a robot that oscillates under load, a pod stuck
in `CrashLoopBackOff`, a sentence with a subtle agreement error, a policy that made
inflation worse.

Give hints in a ladder rather than an answer button: nudge, then narrow, then reveal,
with each rung recorded as a signal about how solid that node really is. The drill
completes only when the thing works again.

- *The ideal:* practise the task, not a proxy for it — and make the completion test
  the artefact working, so being finished is a fact rather than a feeling.
- *Seen in the wild:* **Lichess puzzles** for the pure shape (a position, one right
  idea, immediate verdict) and **Codecademy's split editor** for the applied version,
  where the instructions, the code and the failing test share one screen.
- *Covers:* W6 (correctness is self-evident), A3 (a defined finish), W9 (everything
  needed is in the same frame).

### Guided questions

For the three to five hardest nodes in a topic, replace the wall of explanation with a
short chain of clickable questions that walk the learner into the idea. The important
detail: **wrong answers are the interesting path**. A wrong click does not say
"incorrect" — it says "sure, let's do that", plays the consequence out, and lands on the
contradiction.

Self-derived conclusions stick far better than delivered ones, and clicking keeps it
fast enough that nobody minds. Use this sparingly; every node as a guided dialogue is
exhausting.

- *The ideal:* let the learner reach the conclusion themselves, and treat a wrong
  answer as a branch to explore rather than as an error to correct.
- *Seen in the wild:* **Nicky Case's "The Evolution of Trust"** (ncase.me). You play
  the choices, the consequences run in front of you, and the theory arrives only once
  you have felt why it is needed.
- *Covers:* W14 (commit before being told), W1 (the hook is a question), A2 (the
  payoff is inside the interaction).

### Review deck

Everything else in this document builds understanding; this is the only part that fights
forgetting, and without it a fast sprint decays to nothing in three weeks. Atomic items
get extracted from every node the learner touches — cloze, reverse, application,
production — and surfaced as a short daily session of a dozen or so, mixed across nodes
rather than blocked on one.

The critical link is what happens on failure: a failed item flips its source node to
*shaky* on the map, which reopens it. That closes the loop from recall back to the map
and makes forgetting visible work rather than invisible decay.

- *The ideal:* schedule retrieval rather than re-reading, space it by failure, and
  make a lapse reschedule quietly instead of accumulating into a backlog.
- *Seen in the wild:* **Anki.** One card at a time, a due count you can see the end
  of, and — the part most apps get wrong — a history that is cumulative rather than a
  streak, so two weeks away costs you scheduling and not standing.
- *Covers:* W10 (timed reps live here and nowhere else), W20 (painless return), A9
  (no streaks), A15 (mastered items stop appearing).

### Scoped ask rail

Curiosity arrives mid-sentence and has about two seconds to be served before it is
gone — but serving it must not cost the learner their place, which is exactly what
opening a chat does. So the ask box is pinned beside the content, scoped to the
current node, and it answers inline and short. Every answer offers three follow-ups:
*save this*, *make it a node*, *go deeper*. That last option is what turns a
distraction into an extension of the map.

- *The ideal:* answer the question where it was asked. A learner who has to navigate
  away to ask something usually does not come back to what they were doing.
- *Seen in the wild:* **Google's "People also ask" expanders.** The answer opens in
  place, in a line or two, and the results you were reading are still underneath it.
- *Covers:* W7 (follow the interest), W12 (never lose your place), A11 (one question,
  one answer, not a thread to manage).

### Session wrapper

Open with a contract in one line — *"twelve minutes, four nodes, and you will be able to
read a manifest and say what it does"* — because an unlabelled task has no visible end
and gets deferred rather than started. Close with a generated one-page artefact: what
was covered, in the learner's own vocabulary, the three things they got wrong, and what
comes next.

The opening line is what makes starting possible; the closing page is what makes them
come back, because it accumulates into something they own and doubles as the review
material.

- *The ideal:* state the cost before asking for the commitment, and hand back
  something that outlives the session.
- *Seen in the wild:* **Headspace** for the front half — every session shows its
  length before you start, and you pick three, five or ten minutes rather than
  discovering the length by living through it. **Strava** for the back half, where the
  post-activity summary is the thing people actually return for.
- *Covers:* W3 (say how long), W19 (progress as capability), A3 (a defined finish),
  A5 (the contract replaces the objectives slide).

### Restore point

People stop mid-task constantly, and what determines whether they come back is the
cost of rebuilding where they were. So save on every keystroke, and make re-entry show
the actual state: the question, their half-written answer, and one line of what they
had just worked out. Not a dashboard, not a summary of what is done, and no "are you
sure you want to leave" — leaving has to be as cheap as staying, or people stop
starting anything they cannot finish in one sitting.

- *The ideal:* design for the interruption, because it is coming. Preserve partial
  work by default and leave the next action written down.
- *Seen in the wild:* **Netflix's Continue Watching**, which resumes at the exact
  second, and **Kindle's furthest-page-read**, which does the same across devices.
  Both work because they restore the position, not a description of it.
- *Covers:* W12 (safe stopping), W4 (re-entry offers one pre-filled action), W20
  (painless return), A14 (nothing to set up before resuming).

### Format rotation

Read three screens in the same shape and the third stops registering. So the session
composer rotates deliberately: never two consecutive screens of the same type, and a
forced switch after three of anything. The rotation covers both the *channel* — read,
see, manipulate, say — and the *demand*, because switching from recognising to
producing to judging refreshes attention even when the content has not changed at all.

- *The ideal:* treat monotony as a fault in the material. If a stretch feels samey to
  the person who wrote it, it is already much worse for the person reading it.
- *Seen in the wild:* **Duolingo's lesson mix.** Inside a five-minute lesson you
  translate, listen, tap word tiles, and speak — the vocabulary is constant and the
  task changes every twenty seconds.
- *Covers:* W5 (change format), W17 (pace), A15 (variation instead of repetition).

### Progress, stated as capability

The status dots on the map are the progress bar, and they can only be advanced by
production. Nothing moves when a page is scrolled to the bottom, because an indicator
that responds to consumption teaches the learner that none of the signals mean
anything. Progress is reported as ability — *"you can now find why a rollout is
stuck"* — against a total that is visible and finite from the first screen. There are
no streaks anywhere in the product, and no day is ever marked as missed.

- *The ideal:* measure in units the learner recognises from the real world, make the
  denominator credible, and never let a lapse erase what was learned.
- *Seen in the wild:* **Duolingo, as the cautionary example.** The lesson mix is
  excellent and the streak is the opposite: a mechanic that is strongest immediately
  before it destroys itself. Its one redeeming detail is the streak freeze, which is a
  recovery step defined in advance — that part is worth keeping, and the counter is
  not.
- *Covers:* W19 (concrete progress), W20 (a lapse costs nothing), A9 (streaks), A16
  (vague numbers), A18 (no comparisons against the learner's own past pace).

### Ambient details

Small things, disproportionate effect.

- **Jargon on hover.** Every technical term gives a one-line meaning in place, which
  lets people read safely above their level instead of being written down to.
  *Seen in the wild:* **Wikipedia's page previews** — hover a link, get the first
  paragraph, never leave the article. *Covers A12* (no trip to a glossary).
- **Skeletons, never spinners.** The card's fixed slots appear first and the prose
  fills in, so structure is readable before content arrives. *Seen in the wild:*
  **LinkedIn and YouTube**, whose grey placeholder blocks match the shape of what is
  loading. *Covers A10.*
- **Speculative pre-generation.** While node N is being read, build N's *deeper*
  variant and the two likely successors, so the depth buttons feel instant. Cheap, and
  it changes how much people explore. *Covers W11* (momentum never waits on a load).
- **Honest minute estimates,** measured rather than guessed, on every node, path and
  session. People start things they can finish. *Seen in the wild:* **Medium's "5 min
  read"** and **Kindle's "time left in chapter"**, which is calculated from your own
  reading speed. *Covers W3.*
- **Nothing before the content.** No objectives screen, no course tour, no signup
  before the first node. *Seen in the wild:* **Excalidraw**, which opens straight onto
  a usable canvas, and **Netflix's Skip Intro** for the general principle that the
  preamble is the part people want removed. *Covers A5, A14.*
- **One primary action per screen.** The map stays available, but there is always a
  single obvious next thing, because a grid of thirty equal options is where sessions
  end. *Covers W16.*
- **One instruction at a time.** Multi-step tasks render as a checklist with the
  current step highlighted, so nothing is held in the head. *Covers A11.*
- **No effort language, anywhere.** "Focus", "try harder", "stay committed" are banned
  from generated copy. When a learner stalls, the system changes the task and says so.
  *Covers A20.*

---

## Five kinds of topic

The blocks are universal. Which ones you use is not.

| Kind | Main blocks | "Known" means |
|---|---|---|
| **System** (robotics) | Playground, layered diagram, predict | You can predict how it behaves |
| **Story** (inflation history) | Timeline, decision stops, compare | You can explain why, and argue it |
| **Tool** (Kubernetes) | Sandbox, broken things to fix, compare | You can do it and fix it when it breaks |
| **Skill** (French) | High-volume reps, speech, spaced review | Speed and accuracy under time pressure |
| **Self-help** (motivation) | Personal diagnosis, a written plan, check-ins | You changed a behaviour and it survived a slip |

Two notes. Most topics are blends, so tag the **node**, not the topic. And the kind
decides what "known" means — get that wrong and the map lies about progress.

---

## Five examples

Five topics, one from each kind. Each shows the map, the screen that defines the
topic, one node in detail, and the drill that decides whether the learner actually
has it.

### Robotics — a System topic

**Map:** draw it as a loop, not a list, because that is what robotics is.
Sense (encoders, IMU, cameras, noise, fusion) → Think (frames, kinematics, state
estimation, PID) → Act (motors, PWM, gearing, limits) → Integrate (timing, SLAM,
planning, sim-to-real).

**The signature screen is a playground, not text.** PID control is three sliders and
a live plot:

> Predict: you triple Kp. Draw the new curve. → *You drew a faster, clean approach.*
> Now try it — it overshoots and rings. Your guess was reasonable but proportional
> force does not know about momentum; that is the D term's job.
>
> Now switch on **sensor noise**. Your new D term turns that noise into motor
> chatter. This is why real robots are hard: every fix creates a new problem.

That last beat is the difference between understanding robotics and reading about it.

**Sample node — sensor fusion.** Claim: every sensor lies differently, so weigh each
by how much it can be trusted right now. Visual: a drifting IMU trace, a jumpy GPS
trace, and the fused line threading between them. Mechanism: IMU error is slow and
piles up; GPS error is jumpy but bounded; take the fast part of one and the slow part
of the other. Wrong belief: "more sensors is better" — a sensor with the wrong
assumed error makes the estimate worse.

**Mastery drill:** "This arm wobbles when carrying a load but is steady when empty.
Find the fault." It needs gains, inertia and gravity together — three nodes at once.

### Inflation history — a Story topic

**Map:** one spine of mechanisms (what inflation is, how it is measured and why that
is flawed, demand-pull, cost-push, expectations, how rates transmit, real vs nominal,
who wins and loses), then eras that exercise the spine (Weimar, the 1970s, the
Volcker shock, the calm 1990s–2010s, the 2021–23 surge), then implications for
savings, debt, wages, assets and pensions.

**Signature screen: a timeline with decision stops.** Prices on top, policy and
events below. Scrub to 1979 and you get the numbers *and what people believed then*.
Then:

> **You are the Fed chair, October 1979.** Inflation 12%, unemployment 6%, two failed
> attempts behind you. (1) Rates to 20% and accept a recession. (2) Tighten slowly.
> (3) Wait for oil to fall.
>
> *You picked 2.* That was tried in 1974–75. Inflation fell to 5%, then went back to
> 11%, because each half-attempt taught people the Fed would blink.
>
> What Volcker did cost 10.8% unemployment and the worst recession since the 1930s.
> Inflation went from 14% to 3% and stayed down for forty years. **The lesson:
> credibility is the real asset, and you pay for it once.**

**Second signature screen: pick a person, then scrub.** A pensioner, a homeowner with
a fixed mortgage, a renter, someone holding cash. Watch the same decade rewrite five
different balance sheets. "Inflation moves money from lenders to borrowers" lands far
harder as a picture than as a sentence.

**Guardrail:** where economists still disagree — how much of 2021 was stimulus versus
supply chains — show the competing explanations side by side, with what evidence
would settle it. Teaching an open question as settled produces confident, wrong
learners. This is history, not investment advice.

**Mastery drill:** "In four sentences, tell a sceptical friend why 2021 was not the
1970s — and name the one number that would prove you wrong." The second half is what
turns a memorised story into a model.

### Kubernetes — a Tool topic

Calibration says: backend engineer, knows Docker and Linux, weak on networking, needs
to ship next month. The product should visibly change — Docker nodes collapse to
known, comparisons come from Linux processes, networking gets *more* nodes, and the
path to "deploy and debug a service" lights up while cluster admin dims.

**Teach one master idea first, then reference it forever.** Node 1 is not "install
kubectl":

> Three copies are running. A machine dies. What should happen? → *The system notices
> and starts a new one.* → How does it notice? Something must keep comparing "3
> wanted" against "2 running". **That comparison, running forever, is all of
> Kubernetes.** Everything else is either a statement of what you want or a
> controller working towards it. When something is odd later, always ask: which
> controller, and what does it think you want?

**The cluster is the main stage.** A live sandbox with a picture of the cluster above
and a terminal below. Every node is do-then-see:

> `kubectl delete pod web-z` — **first, does it come back?** Watch: the pod dies, the
> ReplicaSet notices, a new pod appears in four seconds. You did not do that. The
> controller did.

**Broken clusters are the most valuable screen.** `CrashLoopBackOff` (bad config),
`ImagePullBackOff` (auth or typo), stuck `Pending` (nothing can schedule it),
`OOMKilled` (limit too low), a Service returning nothing (selector does not match the
labels — the classic), random 502s (no readiness probe), a stuck rollout, DNS failing
(wrong namespace). Each is a live broken cluster the learner must actually fix.
Clearing this gallery is a far better definition of "known" than any quiz.

**Mastery drill:** "This manifest must survive a node failure, roll out with no
downtime, and keep its data. Three things are wrong. Find them, say what each one
would cost you, and fix them."

### French — a Skill topic

Language breaks the rest of this document's assumptions. Understanding is not the
bottleneck; **volume of production is**. Optimise for reps per minute, not clarity per
screen.

**Two maps side by side.** What you can *do* (introduce yourself → order food → tell a
story in the past → argue a point) and what makes it possible (sounds, gender,
tenses, pronouns, subjunctive). People quit when they can conjugate but cannot speak,
so keep both visible.

**A 15-minute session is 2 minutes of pattern, 10 of production, 3 of review.**
Explanation exists only to unblock production.

**Rotate the production mode** so people do not get good at the exercise instead of
the language: speak it aloud with feedback on liaison and vowels; type a translation
graded on meaning, not exact strings; fill a gap inside a real paragraph; listen and
transcribe at adjustable speed; answer a situation freely and get your own sentence
marked up rather than replaced.

**Drills come from your own mistakes.** The system tracks your recurring errors —
gender on `-ion` nouns, `à` vs `de`, avoir/être — and builds today's practice from
your top three. This is the main difference between an app and a tutor, and an LLM
makes it free.

**Sample node — passé composé vs imparfait.** Do not start with the rule. Start with
*"Je mangeais quand il est arrivé"* — one is the background, one is the event, tap
the background. Then the frame: **imparfait paints the scene, passé composé moves the
plot.** Then fifteen fast reps, then free production. Derive the rule, then drill it.

**Mastery drill:** "Tell me about your last holiday. 45 seconds. Out loud." In a skill
topic, speed under pressure *is* knowing.

### Motivation — a Self-help topic

The trap is a beautifully explained theory that changes nothing. Here, understanding
is not the goal and must not be the measure.

**Start with a diagnosis, not a lecture.**

> "Name one thing you keep meaning to do." → *"My side project."*
> "When you sit down, what actually happens?"
> `[I never sit down]` `[I sit down and drift]` `[I start and abandon]` `[I do it
> once, then not for weeks]`

Each branch is a different problem: a first step that is too big, an unclear next
action, perfectionism, or a missing cue. **Naming their actual pattern is the moment
they trust the product.**

**Theory arrives as diagnosis, never as curriculum.** Six ideas total, each shown only
when the learner's own answer calls for it:

> You said you would "work on the project". That is a category, not a task. Vagueness
> is the most common cause of not starting, and it gets mistaken for laziness almost
> every time. What is the first physical action? Not "design the schema" — "open the
> editor and write the users table."

**The output is a plan, not a summary.**

```
WHEN     After I close my laptop on Tue/Thu
DO       Open the repo, write ONE test. That is the whole commitment.
FLOOR    If I don't want to: 5 minutes, then I may stop.
SETUP    Repo in a pinned tab. Phone in another room.
IF I SLIP  One miss is normal. Two misses means the step is too big — halve it.
           Never "restart on Monday."
PROOF    Tick the calendar. Review after two weeks.
```

**Then follow up.** "It's Thursday. Did it happen?" `[yes] [no] [partly]`. The "no"
branch is the valuable one: it re-runs the diagnosis and edits the plan instead of
offering encouragement. After a month you have something no article can give — a plan
debugged against this person's real life.

**Progress is sessions done and slips recovered**, not concepts read. And be a coach,
not a cheerleader: no fake enthusiasm, no guilt over broken streaks. If someone
cannot act at all, especially with low mood, that is not a motivation-design problem —
say so and point them to a professional.

---

## How this covers the ADHD guidelines

Every point in [adhd-learning-guidelines.md](./adhd-learning-guidelines.md) and the
part of the product that answers it. A requirement with no entry here is a bug in
the design, not an acceptable gap.

### The twenty things that work

| # | Requirement | Where it is met |
|---|---|---|
| W1 | Open with the interesting thing | Node 1 of every topic is a hook or live demo; concept card opens on the claim; map suggests by interest as well as order |
| W2 | Units small enough to finish | 3-minute node cap, each with a stated outcome and a completion state |
| W3 | Say how long before they start | Measured minute estimates on every node, path and session; the session contract |
| W4 | Tiny physical first action | Sessions and resumes open on one keystroke or drag, never on a page of reading |
| W5 | Change format often | Format rotation in the session composer; forced switch after three of a kind; any card can be listened to instead of read, as somebody explaining it rather than as the text spoken |
| W6 | Fast feedback | Drill grading is the one always-live backend call; playgrounds respond on the drag |
| W7 | Move around freely | The map never locks; search enters at any node; every node has its own URL, so a link opens straight into it; *Ask* answers a tangent on the card the reader is on, and keeps the answer there |
| W8 | Hands and mouth busy | Every node completes by production; voice input on explain-back; a card played aloud leaves both free |
| W9 | Everything needed in view | Drill prompts embed their own values; the goal line stays framed; compare tables put both things side by side |
| W10 | Mild urgency | Timed speed reps in the review deck; high event rate in fluency topics |
| W11 | Protect hyperfocus | No break nags, no session-length limits; pre-generation so momentum never waits on a load |
| W12 | Safe stopping | Restore point: keystroke-level save, re-entry into the exact half-finished state |
| W13 | One thing at a time | One concept and one visual per card; map rail dims during a drill |
| W14 | Ask before explaining | Predict-then-reveal on every reveal; guided questions on the hardest nodes |
| W15 | Surprise and story | The misconception slot on every card; timeline topics ordered causally |
| W16 | Reduce decisions | One primary action per screen; the map is available, never required; the depth question is asked once, with two levels already chosen; the narration voice is a topic setting with a default, decided on a settings screen rather than at the moment of pressing play, and eight options rather than the provider's thirty |
| W17 | Err on the side of too fast | Cards written above comfort with depth buttons underneath; no recaps |
| W18 | Skip what they know | Calibration and the profile's background collapse branches; the *scope* choice names what the map leaves out; "I already know this" on every node, honoured without proof; the calibration answers stay editable per topic, so a wrong one is corrected rather than lived with |
| W19 | Concrete progress | Status dots advance only on production; progress stated as new ability |
| W20 | Painless return | "Three things worth reloading" on re-entry; the review queue reschedules instead of piling up |

### The twenty things that do not work

| # | Requirement | Where it is met |
|---|---|---|
| A1 | No long unbroken text | Mechanism section capped at ~5 lines; one required visual; anything longer goes behind *deeper*; and a card that still reads as a wall can be played instead |
| A2 | No payoff only at the end | Every node resolves something inside itself — a prediction, a working command, a status change |
| A3 | No undefined finish | Every drill states its completion test; open verbs are banned from generated task text |
| A4 | No locked steps | Prerequisites are inline notes; the same node exists at several depths |
| A5 | No preambles | No objectives screen and no course tour; the card opens on the claim |
| A6 | No long video | Nothing over two minutes, always with a transcript; a widget wherever one would do |
| A7 | Notes are not the activity | The system writes the notes; learner effort goes into explain-back |
| A8 | Do not rely on them returning | A scheduled nudge that names the next node and opens straight into it |
| A9 | No streaks | Cumulative session count only; missed days are unmarked |
| A10 | No dead time | Streaming with skeletons; speculative pre-generation; no spinner over finished content; a settings change never rewrites a card on the next open — the card that exists is shown, and writing it again is one deliberate press; asking for a card to be read aloud answers immediately and the recording is made behind the screen, which stays readable |
| A11 | Not several instructions at once | One instruction per screen; multi-step tasks render as a checklist |
| A12 | Nothing carried across screens | Everything a map is about to be built from is on the screen that builds it, so nothing chosen earlier has to be remembered; values repeated at the point of use; jargon defined on hover in place; the map's edit screen states the shape and the instruction lines the map was built to, so what was chosen at build time is read rather than remembered; a question asked on a card is answered and kept on that card, and the panel under a card states both what it was written to and what the node now asks for |
| A13 | No clutter | One visual per card; groups on the map collapse, so a wide subject is still one screen; chrome hidden during drills; no badges or notifications mid-session |
| A14 | No setup before starting | Calibration is 60 interesting seconds; the seven choices are one screen each, all skippable, and every one is a pick rather than a form field; the profile is optional and never blocks a topic; sign-in comes after the first node |
| A15 | No repeating known material | Two correct applications retires a node to spaced review; skip is always available |
| A16 | No vague progress | A finite, visible node count and capability units, never a bare percentage; groups are excluded from it, so the total is one the learner can actually reach |
| A17 | No harsh marking | The got/vague/missing/wrong diff; no scores, no percentages, no failure states |
| A18 | Do not assume consistency | Difficulty adapts within the session; no user-visible comparison to their own past pace |
| A19 | Do not time the thinking | Timers only on recall reps and fluency drills; never on a card or an explain-back |
| A20 | No effort framing | Effort language banned from generated copy; a stall changes the task, not the encouragement |

---

## Backend

The UX above implies a specific backend shape. Three decisions carry almost all of the
weight, and getting the first one wrong makes the rest impossible.

**Generate typed objects, not prose.** The LLM fills a schema; the frontend renders
it the same way every time. That is what makes it feel like a product instead of a
chat window. Typed objects are also cacheable, re-renderable at a new depth, and
gradable — prose is none of those.

```jsonc
// ConceptCard
{ "node_id": "sensor_fusion", "depth": 2,
  "claim": "...", "visual": { "type": "chart|diagram|timeline|code|widget", "spec": {} },
  "mechanism": ["...", "..."],
  "example": { "setup": "...", "result": "..." },
  "misconception": { "belief": "...", "correction": "..." },
  "jargon": [ { "term": "...", "gloss": "..." } ],
  "callback": "control_loop", "next": ["kalman_filter"] }
```

Also needed: `KnowledgeMap`, `Drill` (with a reference answer and a hint ladder),
`Evaluation` (got / vague / missing / wrong), `Atom`, `Widget`, `Plan`.

**The learner model is the real product state.** Goal, time budget, where they are and
where they want to get to, age, background, preferred explanation shapes, current depth,
per-node status, open misconceptions with the evidence for each, recurring errors,
review queue. Every generation call reads this. Personalisation is entirely what you put
in the prompt, so this object *is* the product. Let the learner see and edit it — the
account-wide half of it is the profile screen, and editing it changes what is generated
next rather than rewriting what is already cached.

**Cache aggressively; only one call must be live.**

| Layer | Cached |
|---|---|
| Topic map | Shared across learners; personalise by pruning, not regenerating |
| Concept card per (node, depth) | Yes, with a thin per-learner overlay for comparisons |
| Widget specs, drill pools, review items | Pre-generated |
| **Grading what the learner wrote** | **Never — this one must be live and good** |

**Pre-generate ahead.** While they read node N, build N's *deeper* version and the
next two nodes. Depth buttons then feel instant, which changes how much people
explore — and free exploration is the whole advantage over a course.

**Quality:** never let the model invent a number that appears on a chart — pull real
series from a data store and verify facts against a source. Grade against a stored
reference answer, not the model's free judgement, or scoring drifts between nodes.
Flag contested nodes so they render as competing views. Hand-check the map for your
top topics; maps are few and high-leverage.

---

## Making it stick

Speed is worthless if it fades in ten days.

1. **Start each session by recalling, not re-reading.** Five minutes, mixed across
   nodes. Mixing beats drilling one node, and it costs nothing to generate.
2. **Space by failure.** Widening intervals, and a failed item flips its node to
   Shaky on the map so forgetting becomes visible work.
3. **Re-show the learner their own words.** Their old explain-backs are better review
   cues than any generated text, and the growing pile feels like something they own.
4. **Spot-check the skips.** Occasionally ask them to explain a node they marked
   "already know". The map must stay honest, because everything rests on it.

---

## What not to do

Most of the failure modes are catalogued in the companion document, and rather than
restate them here, treat all twenty of its anti-patterns as binding. These are the
additional ones specific to a generated product, where the LLM will happily do the
wrong thing at scale.

| Mistake | Why it fails |
|---|---|
| Endless chat | No map, no memory, no floor. The thing we are replacing |
| 900-word answers | The generator will produce them unasked. Cap the card and hide depth behind buttons |
| Multiple-choice as the assessment | Measures recognition, which is exactly the illusion we are trying to break |
| One template for every topic | French reps and Kubernetes debugging are not the same interaction |
| Level fixed at signup | Level is per node and per moment, and the generator can serve both |
| Invented numbers or flags | One fabricated `kubectl` flag ends your credibility permanently. Ground the facts |
| Content that vanishes | If last week's card cannot be found, nothing accumulates and the artefacts stop mattering |
| Open questions taught as settled | Produces confident, wrong learners. Flag contested nodes and show the disagreement |

---

## Build order

**v0 — the spine.** Calibration → map with status → concept cards with depth buttons →
predict-then-reveal → explain-back with a diff → status updates. Build the restore point
in v0 too; it is small, and without it every interruption costs a learner. One topic
kind only: pick a **Tool** topic like Kubernetes, because correctness is checkable and
the audience tolerates rough edges.

*If this does not already feel much better than a chatbot, nothing later
will fix it.*

**v1 — retention.** Review items, spaced sessions, Shaky nodes, session summaries.
This is what turns a good demo into something people return to.

**v2 — the other topic kinds.** Timeline, playground and widget library, speech and
rep rotation, diagnosis and plans and check-ins. Each is real engineering; do one at a
time and validate it against its example topic.

**v3 — polish.** Live sandboxes, real data behind charts, speculative pre-generation,
automatic compare tables, an editable learner model.

The ADHD requirements are not a later phase. Most of them — minute estimates, no
gates, no streaks, one thing per screen, the restore point — cost almost nothing when
built in from v0 and are expensive to retrofit, because each one is a decision about
what the product fundamentally is.

---

**In one line:** show an honest map, teach one small thing at a depth they control,
make them produce something on every node and tell them exactly what was missing,
then schedule the recall that keeps it.
