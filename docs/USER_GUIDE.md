# User guide

_Italian version: [GUIDA_UTENTE.md](GUIDA_UTENTE.md)._

This page walks through the control panel and the scene editor. For the
keys and how to start Aquaria, see the [README](../README.md); for what
you can do with the fish, [Playing with the fish](INTERACTION.md).

## The control panel

Press `H`, or the round button that appears in the corner when you move the
mouse. Each section opens and closes from its title, and the panel
remembers which ones you left open. Everything you change is saved in the
browser.

### Scenes

A card for each scene, then your own scenes under **My scenes**. Click one
to open it. The last card, **Editor**, opens the [scene editor](#the-scene-editor).

The ⓘ next to the scene's name shows the version, the author and the
license.

### Fauna

A card for each species, with a live picture of the fish and a slider for
how many. Species already in the tank come first. When you add fish they
swim in from the sides; when you remove some, they swim away.

- The **3D** badge on a picture means the species has a 3D model. Click it
  to switch between the model and the lighter fish drawn by Aquaria. **All
  3D** and **None 3D** do it for every species. On a slow computer, fewer
  models help.
- **Fish size** makes small fish bigger and big fish smaller, so you can
  see them all. At 0% sizes are real; at 100% every species is the same
  size. The default is 60%.
- **Realistic** turns off the playful tricks (hypnosis, tickling) and lets
  fish keep their hours: day fish rest at night, night fish wake up.

### Scenery

A card for each group of plants and objects in the scene, with a slider for
how many. Adding more never moves the ones already there.

### Time and Lights

The tank is lit like a reef aquarium: four LED channels (white, blue,
violet and a free accent color) and a faint blue moonlight at night. Under
blue and violet light, corals and anemones glow.

Both sections start on **Recommended**, the setup the scene suggests. As
soon as you touch a control they switch to **Custom**.

**Time** decides what hour it is in the tank:

- _Hour at start_ (the default): the hour you opened the aquarium, then it
  stays there.
- _Fixed hour_: always the hour you choose.
- _Real clock_: follows the time on your computer.
- _Accelerated day_: a whole day in the minutes you choose.

You can also set sunrise, sunset and how long dawn and dusk last. The blue
comes on a little before the white and goes off a little after, as on real
reefs.

**Lights** sets the fixture (the open sky, or a row of LED spots over the
water, with how many), the color and level of each channel, and the
moonlight.

### Look

The look is the composition of water and light: how bright the picture is,
where the sun stands, how the water fades the colors with distance, the
sunbeams, the contrast and the colors. **Look** chooses it: the scene's own,
**Hero** (the open water of the poster, with surface waves and the tank
frame), or **None** (every effect at its default).

Below are sliders for all of it: exposure, sun height and turn, then one
group per effect with every setting it has. The Deep water light group
holds the water itself: how fast red, green and blue fade, how much water
behind the glass stays clear before the haze begins, how much darker
things get deeper down, the scattered light looking down, level and up,
the sun's glow and the sunbeams. Your changes are kept for each look;
**Reset this look** forgets them.

### Lighting and Post-processing

Every effect has its own switch, so you decide what the GPU spends its time
on.

| Switch                | What it does                                               | At start   |
| --------------------- | ---------------------------------------------------------- | ---------- |
| Caustics              | The moving web of light on the sand, rocks and fish        | on         |
| Shadows               | Shadows of fish, rocks and plants                          | if it fits |
| Water reflections     | Light from the water around the tank                       | if it fits |
| Surface waves (alpha) | A moving surface with the sun glaring through (unfinished) | off        |
| Refractive bubbles    | Bubbles that bend the light like glass                     | if it fits |
| Light shaft planes    | Cheap light shafts; not needed with volumetric light       | off        |
| Coral fluorescence    | Corals and anemones glow under blue and violet             | on         |
| Tank frame            | Dark posts at the sides and the stand under the glass      | off        |
| Ambient occlusion     | Darker creases and corners                                 | off        |
| Volumetric light      | Rays of light through the water, blocked by fish and kelp  | if it fits |
| Depth of field        | Blurs what is out of focus                                 | off        |
| Bloom                 | A soft glow around the brightest spots                     | if it fits |
| SMAA anti-aliasing    | Smoother thin edges (grass, fins)                          | off        |
| Vignette and dither   | Darker corners, and no color banding on LED walls          | if it fits |

"If it fits" means Aquaria tries it at start. For about fifteen seconds it
switches these effects on one at a time and keeps each one only if the
GPU can still keep up. A switch you change yourself is never touched again.

Ambient occlusion is the heaviest by far, and depth of field looks like
blur on a wall seen from a distance, so both stay off unless you turn them
on.

### Quality

- **Resolution**: from 540p to 4K. With **Automatic resolution** on (the
  default) Aquaria lowers it when the GPU struggles and raises it again
  when there is room, never above the slider. That way it never takes the
  whole GPU and freezes the screen.
- **Frame limit**: 30 (the default) or 60 frames a second, or none. A limit
  leaves the GPU free for the rest of the computer and saves battery.
- **Anti-aliasing**: MSAA off, 2×, 4× or 8×.
- **Fit effects to this screen**: forgets the effect switches you changed
  and fits them to the GPU again. Useful after you change the frame limit.
- **Show FPS**: frames per second and the resolution actually drawn.
- The GPU in use, with a warning if it is the computer's weaker built-in
  one. The README explains [how to fix that](../README.md#use-the-dedicated-gpu).

### Sound

On or off (also `M`), and the volume: soft bubbling, a thud when you tap
the glass, the food, the torch and the magnifier.

## The scene editor

Press `E`, or click the **Editor** card. The tank is shown from above at an
angle, without water, fish or effects. It works with a mouse or a finger.

- **Moving around**: drag with the right button (or two fingers) to pan,
  scroll (or pinch) to zoom, ⟲ ⟳ to turn the view a quarter turn.
- **Rock**: `＋` adds blocks where you point, `－` removes them. **Brush**
  sets how many at once. **Layers** hides the top layers so you can work
  inside a cave. **Smooth** shows the rock as it will look in the tank. The
  **Rocks** tab of the palette picks the stone.
- **Plants and objects**: pick one in the **Plants** or **Objects** tab and
  tap the sand or a rock to set it down. 🖌 paints many of them at once
  (a lawn, a clump, scattered pebbles); **Density** sets how close. ☝
  selects an item to move it, turn it (↺ ↻), resize it (▫ ▢), change its
  color or delete it (🗑 or `Delete`). If you remove the rock under
  something, it drops to what is below.
- **Scene tab**: start from the water, floor, light and current of any
  bundled scene, then change the tank's size, the water and how murky it
  is, the floor, the background, the light and the current. Export the
  scene as JSON, import one, or delete one of yours.
- `Ctrl+Z` and `Ctrl+Y` undo and redo. Type a name in the bar, then
  **Save** (or **Save as new**). `Esc` leaves without saving.

Your scenes are kept in this browser, under **My scenes**. The first time
one is shown, its card gets a picture of the tank.

To ship a scene with Aquaria, see
[Writing scenes and species](SCENES.md#where-things-are).
