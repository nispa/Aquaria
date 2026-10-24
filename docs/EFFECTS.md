# Effects made of files

_Italian version: [EFFETTI.md](EFFETTI.md)._

You can add a post-processing effect without touching the code: a folder
with a short `effect.json` and a GLSL shader. Aquaria loads it at start and
gives it a switch in the panel, under _Effects_ in the Picture tab. No rebuild needed.

A shader runs only on the GPU and only sees the picture and the numbers
Aquaria gives it, so loading one is safe.

## The folder

```
public/effects/
  index.json          the list of effect folders
  shimmer/
    effect.json
    effect.glsl
```

Add the folder's name to `index.json`:

```json
{ "effects": ["shimmer"] }
```

## effect.json

This is the _Water shimmer_ that comes with Aquaria:

```json
{
  "name": "Water shimmer",
  "stage": "hdr",
  "startup": "manual",
  "shader": "effect.glsl",
  "params": {
    "amount": { "min": 0, "max": 0.01, "default": 0.0015 },
    "speed": { "min": 0, "max": 3, "default": 0.7 },
    "scale": { "min": 1, "max": 60, "default": 14 }
  }
}
```

| Field     | What it is                                                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`    | The switch's label                                                                                                                                 |
| `stage`   | `hdr` works on the raw light, before the final colors (glow, distortion). `display` (default) works on the final colors (grading, grain)           |
| `startup` | `manual` (default): off until someone turns it on. `added`: on at start if the GPU has room. `base`: always on, only for effects that cost nothing |
| `shader`  | The shader file, `effect.glsl` by default                                                                                                          |
| `params`  | Settings: each becomes a `uniform float` with the same name in the shader. Names are lowercase letters and digits                                  |
| `credit`  | If someone else wrote it: `author`, `source` and `license`                                                                                         |

## The shader

Write `main()` and any helper functions. Aquaria adds these for you:

| Name          | Type        | What it is                                  |
| ------------- | ----------- | ------------------------------------------- |
| `tDiffuse`    | `sampler2D` | The picture so far                          |
| `vUv`         | `vec2`      | This pixel's position, 0 to 1               |
| `uTime`       | `float`     | Aquarium time, in seconds                   |
| `uResolution` | `vec2`      | Picture size in pixels                      |
| `uFrame`      | `float`     | Frames drawn since the effect was turned on |
| each param    | `float`     | Its current value                           |

Write it the WebGL 1 way (`texture2D`, `gl_FragColor`); Aquaria converts
it.

A simpler version of the shimmer's shader:

```glsl
// The picture wavers a little, as if seen through moving water.
void main() {
  vec2 p = vUv * scale;
  float t = uTime * speed;
  vec2 shift = vec2(sin(p.y + t), cos(p.x + t)) * amount;
  gl_FragColor = texture2D(tDiffuse, vUv + shift);
}
```

## Trying it

1. Run `pnpm dev`, press `H` and turn the effect on under _Effects_ in
   the Picture tab; _Settings_ beside it opens its sliders. Or open `?effects=shimmer` to see it alone.
2. After changing the shader, reload the page.
3. If the switch does not appear, the browser console says why: a mistake
   in `effect.json`, a name already taken, or a shader that does not
   compile (with the compiler's message). The rest of the aquarium runs
   anyway.
4. Check what it costs: turn on _Show FPS_ in the System tab and
   compare with the effect on and off. A heavy effect should stay
   `manual`.

## Aquaria's own effects

A scene's [look](SCENES.md#look) can change the settings of Aquaria's own
effects too. These are their ids and settings; every setting has a default.

| Id                  | Settings                                                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `underwater`        | `strength` (0 = off), `absorption` (red, green, blue fade per meter), `farDistance`, `clearWater`, `depthDarkening`, `deep`, `horizon`, `surface`, `brightness`, `sunColor`, `sunGlow`, `sunFocus`, `shafts`, `shaftCount` |
| `ambient-occlusion` | `radius`, `intensity`, `samples`, `thickness`                                                                                                                                                                              |
| `volumetric-light`  | `density`, `decay`, `weight`, `exposure`, `threshold`, `samples`                                                                                                                                                           |
| `depth-of-field`    | `focus`, `aperture`, `maxBlur`                                                                                                                                                                                             |
| `bloom`             | `strength`, `radius`, `threshold`                                                                                                                                                                                          |
| `finish`            | `vignette`, `dither`, `contrast`, `saturation`, `tint`                                                                                                                                                                     |

`underwater` reads the depth of the picture, so it always runs first. It
costs one full-screen pass: about 4 ms out of 112 ms at 3840×2160 on an
Intel integrated GPU.
