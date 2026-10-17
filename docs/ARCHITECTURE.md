# How Aquaria is built

_Italian version: [ARCHITETTURA.md](ARCHITETTURA.md)._

A short tour of the main choices, for whoever wants to work on the code.
The rules that follow from them (tests first, no allocations per frame,
and so on) are in [AGENTS.md](../AGENTS.md).

## Why a web page

Aquaria has to run for days on a computer behind a screen in a public
place. A web page is the easiest thing to put there: build it once, copy a
folder, open it in a browser. No installer, no runtime, and an update is a
new folder. Three.js gives enough control over the GPU for what an
aquarium needs, and the whole thing stays small.

## Layers

```
core    numbers, random generator, clock, event bus
scene   the JSON files: what they may contain, loading, checking
sim     the fish and everything that moves: where to go, what to do
render  drawing with Three.js
audio   sounds
ui      the control panel and the overlays
input   mouse and touch
app     puts it all together and runs the loop
```

Each layer only uses the ones above it in this list. The important rule is
that `core`, `scene` and `sim` never touch the browser or the GPU. That
means the whole simulation runs in plain Node.js, so it can be tested
quickly and without a screen: a test can drop food in a tank, run a minute
of simulation and check who ate.

`render` only reads what `sim` decided. It never makes a fish do anything.

## Fish steer, they do not follow paths

Each fish is pushed every frame by a few small forces: keep away from
neighbours, stay with the school, stay in your part of the tank, keep off
the rocks. On top of that, its species' swimming style says where it would
like to go, and its current activity (pecking, resting, hiding) can take
over. What comes out is never scripted, and adding a behaviour means adding
a force or a wish, not rewriting a path. [Swimming styles](SWIMMING.md)
goes into the details.

The body follows the motion: the simulation works out how much the fish
is turning, how hard the tail beats, whether the mouth is open, and the
shader bends and animates the model from those few numbers. That is why a
whole school of the same species can be drawn in one go.

## Data, checked at the door

Scenes, species, plants, objects, effects: all of it is JSON, checked with
[Zod](https://zod.dev) as it loads. A mistake stops the aquarium with the
name of the wrong field, instead of a strange picture or a crash ten
minutes later. Inside the program the data is then trusted.

Adding a scene, a species, a plant or an effect should never need new code.
When it does, something is missing in the engine.

## Steady frame rate

The aquarium is meant to run all day. JavaScript frees memory now and then
by pausing the program for a moment, and at 60 frames a second that pause
shows as a stutter. So the code that runs every frame never creates new
objects: it reuses the same vectors and arrays.

The same goes for the GPU: the resolution follows what the GPU can do, the
heavier effects are switched on only if there is room, and textures are
KTX2 files that stay compressed in video memory.

## Effects as plug-ins

Each post-processing effect is one file (or one small folder of files, see
[Effects made of files](EFFECTS.md)) that says its name, its default
settings and how to build itself. The panel finds it in a list. Adding one
does not touch the rest of the engine.
