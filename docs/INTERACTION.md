# Playing with the fish

_Italian version: [INTERAZIONE.md](INTERAZIONE.md)._

The mouse, or your finger on a touch screen, is a finger on the glass. The
fish notice it.

## What you can do

| You…                              | The fish…                                                              |
| --------------------------------- | ---------------------------------------------------------------------- |
| Leave the mouse still on the tank | The curious ones come over and look at you from behind the glass       |
| Click the tank                    | The ones nearby dart away, some go and hide; a school bunches up       |
| Press `Space`                     | Food falls above the mouse; hungry fish come up and snap it            |
| Draw quick circles near a fish    | It is **hypnotized**: it stops, turns with your circles and rolls over |
| …then stop                        | It comes round **dizzy**, wobbling for a few seconds                   |
| Scribble right over a fish        | It is **tickled**: it wriggles belly up, then zigzags away             |
| Press `T`                         | The mouse is a **torch**: some fish gather in the light, shy ones flee |
| Press `Z`                         | A **magnifying glass** follows the mouse                               |
| Press `A`                         | You see what every fish is doing                                       |
| Press `M`                         | Sound on or off                                                        |

When you move the mouse or touch the screen, round buttons show up in the
top right corner: point, torch, magnifier, food and panel. They are big
enough for a finger and fade away after a few seconds.

**On a touch screen** every touch taps the glass, since a finger cannot
hover. Turn on **Point** (`P`) and a touch points instead, like the resting
mouse: curious fish come over, circles and scribbles work, and nobody gets
scared. The torch and the magnifier always point.

Hypnosis and tickling are toys, not biology. Turn on **Realistic** in the
panel's Fauna section and they are gone, while fish keep their hours and
rest at night. Everything else works either way.

## Who reacts, and how much

Each species sets its character in `public/species.json`, under
`behavior`, with values from 0 to 1:

- `curiosity`: how many of them come to look at your finger. It is always
  the same individuals, so a tank has its regular onlookers.
- `shyness`: how far away a tap scares it. A bold fish only notices taps
  close by; a shy one, taps across the tank.
- `appetite`: how keen it is on food. A fish that has eaten enough ignores
  food for a few minutes.
- `hiding`: how many of them, when scared, run to the nearest shelter and
  stay there a few seconds, instead of just darting off. Shelters are
  plants and objects tagged `shelter`: anemones, corals, kelp, driftwood.
  A clownfish always hides in its own anemone.
- `torch`, from -1 to 1: above 0 the fish likes the torch and gathers in
  its beam; below 0 it flees it. The torch works best at night.

A scared fish also alarms its school, which closes ranks for a while.

## The tricks, in detail

**Hypnosis.** The circles need to be quick and steady, about half a turn a
second or faster. Every fish near the line from your eye through the finger
falls under the spell within a second: it nearly stops, floats, turns with
your circles, rolls over and keeps its eyes on your finger. When you stop,
a fish that was deeply hypnotized stays dizzy for a few seconds.

**Tickling.** Scribble fast, back and forth, right on top of the fish.
After a moment it wriggles belly up for a second, then shoots off in a
zigzag.

**The torch.** A warm beam goes from your eye through the glass into the
tank. While it is on, the mouse is a torch rather than a finger: no fish
come to look, and circles do nothing. Taps and food still work.

**The magnifying glass.** A round lens shows what is under the mouse three
times bigger. The mouse is still a finger, so curious fish come and look
at you through it.

## Seeing what goes on: `A`

`A` writes over every fish what it is doing (`wander 12s`, `peck ×3`,
`inspect`) or what spell it is under (`hypnotized 80%`, `dizzy 3s`), with a
line to the place it is going to. The fish nearest the mouse gets a card:
species, size, swimming style, activity, speed, how full it is, how
scared. A line at the top says what your finger is drawing.

With `A` on, `C` draws the shapes fish swim around.

## Who wins

When several things call a fish at once, the first in this list wins:

1. fear, after a tap;
2. food, if it is hungry;
3. a spell: hypnosis, dizziness, tickling;
4. the torch, or else curiosity about your finger;
5. its activity (pecking, inspecting, resting);
6. its swimming style.

The first four interrupt whatever activity the fish was doing.

## For developers

How a gesture gets to the fish:

1. `src/input/pointer.ts` turns mouse and touch into `pointer-move`,
   `pointer-leave` and `tap` events.
2. `src/app/main.ts` asks the view where the pointer meets the glass and in
   which direction the viewer is looking, and passes both to the
   simulation (`setFinger`, `tap`, `dropFood`).
3. `src/sim/gesture.ts` follows the finger across the glass and measures
   its speed and how much it turns. Circles turn steadily one way;
   scribbles turn a lot, but back and forth.
4. `src/sim/play.ts` keeps, for each fish, how hypnotized, dizzy or tickled
   it is, and turns that into wishes (heading, height, speed, tail) and
   posture (roll, wriggle, eyes), like an activity does.

All of this is plain simulation code: no browser, no GPU. Tests draw
circles and scribbles as lists of points.

To add a new way to play:

1. If it needs a new input (a phone, a camera), put it in `src/input/` and
   have it send events. Nothing in `sim` should change for that.
2. Turn the raw input into something meaningful with a small, tested
   function, like `gesture.ts` does.
3. Express the reaction as wishes and posture, and let the steering do the
   moving: it keeps fish out of the rock and inside the tank.
4. Decide where it goes in [Who wins](#who-wins).
5. Show it in the `A` overlay (`src/ui/activityOverlay.ts`).
6. Describe it here, in both languages.

### Ideas for later

- Drag the finger slowly and a school follows it.
- A double tap always followed by food: after a while the fish come to the
  double tap alone.
- Hold on a fish and it follows the mouse until you let go.
- Hold the button to blow bubbles.
- A phone as a remote, or a webcam that notices people in front of the
  screen.
- On a phone, its motion sensors: tilt it and the view turns a little, as
  through a small window; a quick sideways shake knocks on the tank and the
  fish dart to cover.
