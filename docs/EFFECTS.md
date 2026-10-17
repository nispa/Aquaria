# Effects made of files

A post-processing effect can be a folder of files instead of code: a
short `effect.json` and a GLSL fragment shader. Aquaria loads it at
startup next to its own effects and gives it a switch in the control
panel, under _Post-processing_. Nothing needs to be rebuilt.

A shader only runs on the GPU and can read nothing but the picture and
the numbers Aquaria hands it, so an effect file is safe to load.

## The folder

```
public/effects/
  index.json          lists the effect folders
  shimmer/
    effect.json       what the effect is (below)
    effect.glsl       its fragment shader
```

Add the folder's name to `index.json`:

```json
{ "effects": ["shimmer"] }
```

## `effect.json`

```json
{
  "name": "Water shimmer",
  "stage": "hdr",
  "startup": "manual",
  "shader": "effect.glsl",
  "params": {
    "amount": { "min": 0, "max": 0.01, "default": 0.0015 },
    "speed": { "min": 0, "max": 3, "default": 0.7 }
  }
}
```

| Field     | Meaning                                                                                                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`    | The switch's label in the panel.                                                                                                                                                                         |
| `stage`   | `hdr`: on the linear picture, before tone mapping (light, glow, distortion). `display` (default): on the final colors (grading, grain).                                                                  |
| `startup` | `manual` (default): off until the viewer turns it on. `added`: switched on at startup when the GPU has room, after Aquaria's own effects. `base`: always on; only for effects that cost next to nothing. |
| `shader`  | The shader file in the folder; `effect.glsl` by default.                                                                                                                                                 |
| `params`  | Settings, each a `uniform float` of the same name in the shader, with its range and the tuned default. Names are GLSL names: a lowercase letter, then letters and digits.                                |
| `credit`  | For an effect that is not your own: `author`, `source` (URL) and `license`, one that allows reuse, changes and redistribution, also commercially (see `ASSETS.md`).                                      |

## The shader

Write the helper functions and `main()`; Aquaria puts these declarations
before them:

| Name          | Type        | What it is                                     |
| ------------- | ----------- | ---------------------------------------------- |
| `tDiffuse`    | `sampler2D` | The picture so far.                            |
| `vUv`         | `vec2`      | Where this pixel is, 0..1 across the frame.    |
| `uTime`       | `float`     | The aquarium's time, seconds.                  |
| `uResolution` | `vec2`      | Size of the picture drawn, pixels.             |
| `uFrame`      | `float`     | Frames drawn since the effect was switched on. |
| each param    | `float`     | Its value, the default from `effect.json`.     |

Write it as for WebGL 1 (`texture2D`, `gl_FragColor`); Aquaria compiles it
as GLSL ES 3.00 for WebGL 2. Three.js `#include`s are not available.

```glsl
// Water shimmer: the picture wavers a little.
void main() {
  vec2 p = vUv * 14.0;
  float t = uTime * speed;
  vec2 shift = vec2(sin(p.y + t), cos(p.x + t)) * amount;
  gl_FragColor = texture2D(tDiffuse, vUv + shift);
}
```

## Trying it

1. Run `pnpm dev`, open the aquarium, press `H` and switch the effect on
   under _Post-processing_. `?effects=shimmer` opens the tank with that
   effect alone.
2. After a change to the shader, reload the page.
3. If the switch is missing, the browser console says why: the
   `effect.json` is invalid, the id is taken by one of Aquaria's own
   features, or the shader does not compile (with the compiler's message).
   A broken effect is left out; the rest of the aquarium runs as usual.
4. State the cost: switch on _Show FPS_ in the Quality section and compare
   with the effect on and off at 4K. A heavy effect stays `manual`.
