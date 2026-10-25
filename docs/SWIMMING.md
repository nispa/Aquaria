# Swimming styles

_Italian version: [NUOTO.md](NUOTO.md)._

Each species moves in its own way. A tang swims long laps, a damsel darts
and glides, a clownfish stays over its anemone, a shrimp walks on the
bottom. This page explains how to choose and tune that, and what fish do
with their day.

![Paths of three fish per style seen from above, glass at the top, and the tail effort of one of them over a minute](swimming-styles.png)

<sub>One minute of each style seen from above, glass at the top. Under each
tank, how hard the red fish's tail is working. Remade by
`pnpm docs:gallery`.</sub>

## Picking a style

In `public/species.json`, give the species a `swim` entry:

```json
"swim": { "style": "burst-coast", "burstSpeed": 2, "coastSeconds": [1, 3] }
```

Only `style` is required. Every other value has a default, and the defaults
are the look each style was tuned for, so start without them. A species
with no `swim` entry uses `cruise`.

Values are relative, so the same numbers work for a small fish and a large
one:

- speeds are a share of the species' cruise speed (1 = its usual pace);
- distances are in body lengths;
- angles are in radians (3.14 is a U-turn);
- times are in seconds; a pair like `[1, 3]` means "somewhere between 1
  and 3, at random each time".

A fish never goes faster than its species' `speed.max`.

## The styles

### `cruise`: long, smooth laps

Tangs, sardines, tetras. The heading wanders gently, the pace drifts a
little, and now and then the fish moves to a new height.

| Value                 | Default | What it is                                                 |
| --------------------- | ------- | ---------------------------------------------------------- |
| `speedVariation`      | 0.15    | How much the pace changes                                  |
| `turnJitter`          | 0.5     | How restless the heading is                                |
| `heightChangeSeconds` | 12      | How often it moves to a new height                         |
| `thrust`              | 1       | How much the tail works in cruise (below 1: swims on fins) |

### `burst-coast`: dart and glide

Damsels, guppies, platies, tangs. A short burst in a new direction, then a
long glide with the tail almost still, slowing down. With low `thrust`
(like a blue tang), the burst is a pectoral-fin pulse — both fins spread
wide and beat together, then fold against the body for the glide. Fish in a
group are never in step.

| Value                 | Default    | What it is                                                   |
| --------------------- | ---------- | ------------------------------------------------------------ |
| `burstSpeed`          | 2.2        | Pace during a burst                                          |
| `burstSeconds`        | 0.35       | How long a burst lasts                                       |
| `coastSpeed`          | 0.35       | Pace it slows down to                                        |
| `coastSeconds`        | [1.2, 3.5] | How long a glide lasts                                       |
| `burstTurn`           | 0.9        | How much it turns at each burst                              |
| `heightChangeSeconds` | 6          | How often it moves to a new height                           |
| `thrust`              | 1          | How much the tail works in a burst (low: pectoral-fin pulse) |

### `hover`: staying in one spot

Clownfish, grammas, gouramis. The fish stays near one spot: it drifts
slowly, turns on the spot every few seconds, and goes back if it strays. If
something carries it away (food, a scare), it swims home afterwards.

With `home`, the spot is a plant or object instead, the nearest one with
that tag. A clownfish with `"home": "anemone"` stays over the nearest
anemone, even if the anemone is lower than where clownfish usually swim. If
the scene has no anemone, it stays where it started.

| Value                 | Default  | What it is                            |
| --------------------- | -------- | ------------------------------------- |
| `speed`               | 0.2      | Drifting pace                         |
| `turnSeconds`         | [1.5, 5] | Time between turns                    |
| `turnAngle`           | 2.2      | Largest turn                          |
| `roamBodyLengths`     | 4        | How far it strays before going back   |
| `heightChangeSeconds` | 10       | How often its height changes a little |
| `home`                | none     | Tag of the place to stay over         |
| `dive`                | none     | Dives into its home now and then      |

With `dive`, a fish with a home goes into it, as a clownfish into its
anemone: it stays among the tentacles for `inSeconds`, `depthBodyLengths`
(0.6) below the top, turning slowly to rub along them, then comes out to
look around for `outSeconds`. Startled, it hides that deep. The clownfish:

```json
"swim": {
  "style": "hover",
  "speed": 0.3,
  "roamBodyLengths": 1.5,
  "home": "anemone",
  "dive": { "inSeconds": [5, 12], "outSeconds": [3, 8] }
}
```

Over a host, a fish larger than its kind keeps closer to it: the larger of
a pair stays by the anemone, the smaller strays further.

### `glide`: slow figure eights

Angelfish, moorish idols. The fish swims a slow figure eight while rising
and sinking in a long wave. The tail barely works.

| Value                 | Default | What it is                                   |
| --------------------- | ------- | -------------------------------------------- |
| `speed`               | 0.7     | Pace                                         |
| `turnRate`            | 0.35    | How fast it turns through each loop          |
| `heightSwing`         | 0.6     | How much of its height range one wave covers |
| `heightPeriodSeconds` | 24      | How long one rise and fall takes             |

Slower fish, or faster turns, make tighter loops.

### `patrol`: laps around a spot

Butterflyfish, the barramundi. The fish picks a spot and circles it,
changing direction now and then.

| Value               | Default  | What it is                        |
| ------------------- | -------- | --------------------------------- |
| `speed`             | 0.8      | Pace                              |
| `radiusBodyLengths` | 6        | Size of the lap                   |
| `reverseSeconds`    | [15, 40] | Time between changes of direction |

### `crawl`: walking on the bottom

Shrimps, crabs, hermit crabs. The animal walks on the sand and over the
rock, stops to pick at the ground, then sets off another way. The current
does not move it.

A shrimp still swims when it has a reason: to get away from a tap, to reach
food, to climb to the top of a plant. A low place, like a shell, it pecks on
foot.

| Value         | Default  | What it is                                        |
| ------------- | -------- | ------------------------------------------------- |
| `speed`       | 0.5      | Walking pace                                      |
| `walkSeconds` | [2, 6]   | How long it walks between stops                   |
| `stopSeconds` | [1, 4]   | How long it stands still                          |
| `turnAngle`   | 1.2      | How much it turns after a stop                    |
| `turnJitter`  | 0.3      | How much it wanders while walking                 |
| `rideHeight`  | 0.12     | How high its body is off the ground, body lengths |
| `sideways`    | false    | Walks sideways, like a crab                       |
| `swims`       | true     | `false`: never leaves the ground                  |
| `fright`      | `"flee"` | `"shell"`: hides in its shell instead of running  |

A crab is `"sideways": true, "swims": false`: it runs, hides and eats on
foot, and backs up without turning round. A hermit crab is
`"swims": false, "fright": "shell"`: when scared it pulls into its shell
where it stands and stays still until it calms down.

### Who does what

| Style         | Species                                                                               |
| ------------- | ------------------------------------------------------------------------------------- |
| `cruise`      | blue tang, yellow tang, purple tang, sardine, neon tetra, harlequin rasbora, seabream |
| `burst-coast` | three-bar damsel, guppy, platy                                                        |
| `hover`       | clownfish, royal gramma, dwarf gourami                                                |
| `glide`       | moorish idol, emperor angelfish, freshwater angelfish                                 |
| `patrol`      | butterflyfish, barramundi                                                             |
| `crawl`       | red cherry shrimp, freshwater crab, hermit crab                                       |

## What fish do all day

The style is _how_ a fish swims. On top of it, every fish is always doing
something, its **activity**:

| Activity  | What the fish does                                                           |
| --------- | ---------------------------------------------------------------------------- |
| `wander`  | Just swims about in its style                                                |
| `inspect` | Goes to look at a place for a few seconds                                    |
| `peck`    | Goes down to a place and picks at it, mouth open, a few times                |
| `rest`    | At its time of rest, settles by a shelter or near the bottom and keeps still |

When one activity ends, the next is drawn at random. Give a species its
activities in `activities`:

```json
"activities": {
  "wander": { "weight": 1, "seconds": [12, 30] },
  "peck": { "weight": 0.8, "tags": { "algae": 1, "plant": 0.6 } },
  "inspect": { "weight": 0.3, "tags": { "coral": 1, "starfish": 0.5 } }
}
```

- `weight` is how often it is chosen compared with the others. A species
  with no `activities` only wanders.
- `tags` says which places interest it, from 0 to 1 (see below). A fish
  only goes to places in its own depth bands, but any height: a tang that
  swims high still comes down to graze the rocks.
- `wander.seconds`: how long it wanders before choosing again.
- `inspect.seconds` (`[4, 10]`) and `inspect.distanceBodyLengths` (2): how
  long it looks, and from how far.
- `peck.pecks` (`[3, 7]`): how many pecks before it leaves.
- `rest` (weight 1, tags `{ "shelter": 1 }`, `seconds` `[40, 90]`): how
  much and where it rests.

A tap on the glass, food or your finger on the glass interrupt any
activity.

**Day and night.** With **Realistic** on in the panel, fish keep their
species' hours, set by `behavior.active`: `day` (the default), `night` or
`always`. As their time of rest comes, they choose `rest` more and more
often. A reef calms down at night while the barramundi wakes up. Without
Realistic nobody sleeps.

Press `A` to see the activity of every fish, with a line to the place it is
about.

## Places and tags

Fish do not look for "the anemone" or "that rock": they look for **tags**.
Every plant and object has a few: an anemone is `anemone` and `shelter`, a
rock is `rock` and `algae`, a table coral is `coral` and `shelter`. They
are set in the object's folder (see [Plants and objects](OBJECTS.md#tags-what-it-is-to-a-fish)),
and a scene entry can change them:

```json
{ "kind": "rock", "count": 3, "color": "#7d7468", "tags": ["rock", "shelter"] }
```

Now those three rocks are a place to hide. Changing tags is enough to give
a species a new home or a new favourite food.

## Fish and obstacles

Fish swim around rocks, corals and wood, and around each other.

- Each object has a rough collision shape. A fish looks a little ahead and
  swerves round what is in the way without slowing down. With `A` on, `C`
  draws these shapes.
- Plants are soft: fish swim through kelp and snuggle into anemones.
- A fish going to a place (to peck, rest or hide) comes right up to it.
- A fish stuck in a corner of the rock for a couple of seconds looks for
  the most open way out.
- Bigger fish push smaller ones aside, not the other way round.

## For developers

### What a style does

A style never moves a fish. Each step it only says what the fish would
like: a heading, a height, a pace, how fast to reach it and how hard the
tail works (`SwimState`, in `src/sim/behaviors/types.ts`). The simulation
(`src/sim/simulation.ts`) mixes that with everything else:

1. the style updates its wishes;
2. a force turns the fish towards the wanted heading, and a gentle pull
   moves it towards the wanted height;
3. the other forces add up: neighbours, school, the edges of its part of
   the tank, sand and rock, obstacles;
4. the pace moves towards the wanted one, unless a reaction (fear, food,
   curiosity) sets it instead;
5. the tail effort follows speed and acceleration, scaled by the style's
   `thrust`, so a glide really looks like a glide;
6. the pectoral fins follow the same push (`src/sim/pectoralFins.ts`): a
   fish with little thrust (`hover`) keeps station on them, beating them
   in turn; a cruising one rows them along gently; a dash folds them, and
   braking or turning spreads them (see [FISH_MODELS.md](FISH_MODELS.md#pectoral-fins)).

Activities work the same way: each step they may overwrite the style's
wishes. They can also open the mouth and dive steeply, which a style never
does.

Walkers (`crawl`) are the exception: the simulation keeps them on the
ground at `rideHeight` and their body turns on its own (`Fish.facing`), so
a crab can walk sideways.

Everything random comes from the seeded generator, so the same seed gives
the same fish doing the same things. Tests and screenshots rely on it.

### Adding a style

1. Declare its values in `src/scene/swimming.ts`, each with a default, and
   add it to `swimSchema`.
2. Write it in its own file in `src/sim/behaviors/`, with `start` (set up a
   fish) and `step` (update its wishes; it runs for every fish every
   frame, so no allocations).
3. Register it in `SWIM_STYLES` in `src/sim/behaviors/index.ts`. TypeScript
   complains if you forget.
4. Test it next to its file. `harness.ts` runs a style on its own, in a
   fixed room with a seeded generator.
5. Add it to this page.

Activities live in the same folder and are added the same way (`ACTIVITIES`,
values in `src/scene/activities.ts`).
