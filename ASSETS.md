# Third-party assets

Every third-party asset (models, textures, images, sounds) used in this
repository must be listed here with its source, author and license.
Only CC0, CC-BY or equivalently permissive licenses are accepted.

| Asset                       | Path                                 | Source                                   | Author                                                    | License |
| --------------------------- | ------------------------------------ | ---------------------------------------- | --------------------------------------------------------- | ------- |
| Dense Sand (textures)       | `public/assets/materials/fine-sand/` | https://polyhaven.com/a/dense_sand       | Dimitrios Savva                                           | CC0     |
| Rock Boulder Dry (textures) | `public/assets/materials/reef-rock/` | https://polyhaven.com/a/rock_boulder_dry | Dimitrios Savva (photography), Rico Cilliers (processing) | CC0     |

Material textures are derived from the 2K PNG maps: resized (sand 2048 px,
rock 1024 px) and repacked as WebP. `normal.webp` is the OpenGL normal map;
`surface.webp` packs displacement (R), roughness (G) and the diffuse map's
luminance normalized to 0.5 (B), so scenes keep choosing the color.

Everything else (fish, plants, corals, shells, starfish, water, light) is
procedural geometry and shaders generated in code.
