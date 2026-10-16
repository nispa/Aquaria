# Swimming styles

_Italian version: [NUOTO.md](NUOTO.md)._

A fish in Aquaria does not follow a scripted path. Every frame it is pushed
by a handful of steering forces (keep apart, stay with the school, stay in
the habitat, keep off the sand), and its **swimming style** adds the one
thing that makes a species recognisable: _how_ it moves when nothing else
calls for its attention. A tang cruises in long laps, a damsel darts and
glides, a clownfish hovers on the spot, an angelfish drifts in slow figure
eights.

Styles are pure data from the point of view of a species: you pick one in
`public/species.json` and tune it there. No code changes are needed to give
a species a different style, or to tune one.

## Choosing a style for a species

Add a `swim` entry to the species in `public/species.json`:

```json
{
  "id": "three-bar-damsel",
  "swim": { "style": "burst-coast", "burstSpeed": 2, "coastSeconds": [1, 3] }
}
```

- `style` is required and picks one of the five styles below.
- Every other field is optional; a missing one takes the default listed in
  the tables below, the look the style was tuned for.
- A species with no `swim` entry cruises (`{ "style": "cruise" }`).
- The file is validated when it loads. An unknown style, a parameter that
  belongs to another style, or a range written backwards (`[3, 1]`) stops
  the aquarium with a message naming the field.

### Units

All parameters are relative, so one style suits a 3 cm tetra and a 70 cm
barramundi alike:

| Kind      | Unit                                                       |
| --------- | ---------------------------------------------------------- |
| Speeds    | Share of the species' `speed.cruise` (1 = cruise speed)    |
| Distances | Body lengths of the individual                             |
| Angles    | Radians (π ≈ 3.14 is a U-turn)                             |
| Durations | Seconds; `[min, max]` pairs are drawn at random in between |

A fish never goes faster than its species' `speed.max`, whatever a style
asks for.

## The five styles

### `cruise`: long, smooth laps

Tangs, schooling fish, open-water swimmers. The heading wanders gently, the
speed drifts slowly around cruise speed (between 55% and 145% of it), and
every so often the fish settles at a new height somewhere in its habitat.

| Parameter             | Default | Meaning                                                |
| --------------------- | ------- | ------------------------------------------------------ |
| `speedVariation`      | 0.15    | Typical spread of the speed around cruise speed        |
| `turnJitter`          | 0.5     | How restless the heading is, radians per √second       |
| `heightChangeSeconds` | 12      | Average time between changes of the height it swims at |

### `burst-coast`: dart, glide, slow down

Damsels, guppies, platies, many small reef fish. The fish alternates two
phases:

1. **Burst**: it turns to a new heading and accelerates hard, tail beating
   at full strength.
2. **Coast**: the tail goes almost still and the fish glides, losing speed
   to drag, drifting a little off course.

Each fish starts at a random point of its cycle, so a group never darts in
step.

| Parameter             | Default    | Meaning                                          |
| --------------------- | ---------- | ------------------------------------------------ |
| `burstSpeed`          | 2.2        | Speed wanted in a burst                          |
| `burstSeconds`        | 0.35       | Length of a burst                                |
| `coastSpeed`          | 0.35       | Speed the fish slows towards while coasting      |
| `coastSeconds`        | [1.2, 3.5] | Length of a coast, drawn at random each time     |
| `burstTurn`           | 0.9        | Typical change of heading at each burst, radians |
| `heightChangeSeconds` | 6          | Average time between changes of height           |

### `hover`: station keeping

Clownfish, grammas, gouramis. The fish remembers the spot where it started
swimming freely and keeps station there: it drifts slowly, makes small
corrections, and every few seconds turns on the spot. If something carried
it away (food, a fright, its school), the next turn points it back home.
Its height wanders a little around the height of the spot.

| Parameter             | Default  | Meaning                                                 |
| --------------------- | -------- | ------------------------------------------------------- |
| `speed`               | 0.2      | Drifting speed (each turn sets off at 70–130% of it)    |
| `turnSeconds`         | [1.5, 5] | Time between turns                                      |
| `turnAngle`           | 2.2      | Largest turn on the spot, radians (the smallest is 0.4) |
| `roamBodyLengths`     | 4        | How far it strays from its spot before heading back     |
| `heightChangeSeconds` | 10       | Average time between small changes of height            |

### `glide`: slow figure eights

Angelfish, moorish idols, other tall, long-finned fish. The fish turns
steadily one way through a full loop, eases into a turn the other way for
the next loop, and so on: a figure eight. At the same time it rises and
sinks through its habitat in a long, slow wave. The tail works lazily.

| Parameter             | Default | Meaning                                                  |
| --------------------- | ------- | -------------------------------------------------------- |
| `speed`               | 0.7     | Gliding speed                                            |
| `turnRate`            | 0.35    | Turn rate through each loop, radians per second          |
| `heightSwing`         | 0.6     | How much of the habitat's height one rise and fall spans |
| `heightPeriodSeconds` | 24      | Time of one rise and fall                                |

The size of a loop follows from speed and turn rate: radius = speed ÷ turn
rate. A slower fish or a faster turn makes tighter loops.

### `patrol`: laps around a home spot

Territorial fish: butterflyfish, a barramundi in its corner. The fish picks
a home spot where its whole lap fits in the habitat and circles it, steering
back onto the circle when it is off it. Now and then it changes the way
round. It swims at the height of its home.

| Parameter           | Default  | Meaning                                           |
| ------------------- | -------- | ------------------------------------------------- |
| `speed`             | 0.8      | Patrolling speed                                  |
| `radiusBodyLengths` | 6        | Radius of the lap; shrunk to fit a narrow habitat |
| `reverseSeconds`    | [15, 40] | Time between changes of direction                 |

## What the bundled species do

| Style         | Species                                                                               |
| ------------- | ------------------------------------------------------------------------------------- |
| `cruise`      | blue tang, yellow tang, purple tang, sardine, neon tetra, harlequin rasbora, seabream |
| `burst-coast` | three-bar damsel, guppy, platy                                                        |
| `hover`       | clownfish, royal gramma, dwarf gourami                                                |
| `glide`       | moorish idol, emperor angelfish, freshwater angelfish                                 |
| `patrol`      | butterflyfish, barramundi                                                             |

## How it works

### A style only says what the fish wants

A style never moves a fish itself. Each step it fills in a small record,
the fish's `SwimState` ([`src/sim/behaviors/types.ts`](../src/sim/behaviors/types.ts)):

| Field      | Meaning                                                          |
| ---------- | ---------------------------------------------------------------- |
| `yaw`      | Wanted heading seen from above (0 = +x, π/2 = towards the glass) |
| `height`   | Wanted height above the floor, m                                 |
| `speed`    | Wanted speed, share of cruise speed                              |
| `response` | How quickly the fish reaches that speed (a burst is fast)        |
| `thrust`   | How hard the tail works: 0 still (gliding) … 1 full beat         |

plus a few counters the style keeps for itself (timers, a clock, the way
round, the home spot).

### The simulation turns wishes into motion

```mermaid
flowchart LR
  S[Swimming style] -->|yaw, height| F[Steering forces]
  B[Boids: separation, school, habitat walls, seabed] --> F
  R[Reactions: fear, food, curiosity] -->|override speed| V
  S -->|speed, response| V[Speed control]
  F --> M[Velocity]
  V --> M
  S -->|thrust| P[Posture: tail effort]
  M --> P
```

Every step, for every fish ([`src/sim/simulation.ts`](../src/sim/simulation.ts)):

1. **The style steps** and updates the fish's wishes.
2. **Heading.** A force turns the fish towards `yaw`
   ([`addHeading`](../src/sim/steering.ts)). It acts _across_ the
   velocity only, so it turns the fish without speeding it up. That is
   what lets a hovering fish turn on the spot: at low speed the same
   sideways force swings it round much faster.
3. **Height.** A vertical pull towards `height`, at full strength from
   0.3 m away. Fish still climb and dive gently (their vertical speed is
   capped), so a change of height looks like a slow slope, not a lift.
4. **Everything else** adds its force as before: separation, schooling,
   the soft walls of the habitat, clearance over sand and rock.
5. **Speed.** The fish speeds up or slows down towards `speed` at the rate
   `response`. If it is reacting to something (fleeing a tap, going for
   food, inspecting a finger on the glass), the reaction sets the pace
   instead and the tail works fully.
6. **Posture.** The tail's effort grows with speed and acceleration
   ([`tailEffort`](../src/sim/posture.ts)) and is multiplied by `thrust`,
   so a burst beats hard and a coast is still. The body still bends into
   every turn.

### Where styles start

A fish already in the tank when the scene opens starts its style where it
is. A fish that swims in through a side wall starts its style at a random
spot of its habitat once inside. Otherwise every newcomer would hover or
patrol right next to the wall it came through.

### The room

Styles work in the fish's **room**: its habitat (depth bands and height
range) less the soft walls that push fish back inside. Heights and home
spots are always picked inside it, so a style never asks a fish to fight
its own habitat.

### Determinism

All randomness comes from the simulation's seeded generator. The same seed
gives the same fish doing the same things, which keeps tests and visual
snapshots reproducible.

## Adding a style

1. **Declare its parameters** in [`src/scene/swimming.ts`](../src/scene/swimming.ts):
   a `z.strictObject` with a `style` literal and a default for every
   parameter, added to `swimSchema`.
2. **Write it** in a file of its own in `src/sim/behaviors/`, implementing
   `SwimStyle<"your-id">` with two methods:
   - `start(state, params, context)` sets up a fish that starts swimming
     freely (pick a home, a phase, a first height…).
   - `step(state, params, context, deltaSeconds)` updates the wishes. It
     runs for every fish at 60 fps: no allocations.
3. **Register it** in `SWIM_STYLES` in
   [`src/sim/behaviors/index.ts`](../src/sim/behaviors/index.ts). The
   table's type lists every declared id, so TypeScript reports a style
   declared but not registered.
4. **Test it** next to it (`yourStyle.test.ts`). The harness in
   [`src/sim/behaviors/harness.ts`](../src/sim/behaviors/harness.ts) runs
   a style on its own, in a fixed room with a seeded generator, so a test
   can check e.g. that the speed varies or the fish turns back home.
5. **Document it** here.

Helpers shared by styles (random durations and heights, heading jitter,
heading towards a point) are in
[`src/sim/behaviors/shared.ts`](../src/sim/behaviors/shared.ts).
