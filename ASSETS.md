# Third-party assets

Every third-party asset (models, textures, images, sounds) used in this
repository must be listed here with its source, author and license.
Only CC0, CC-BY or equivalently permissive licenses are accepted.

| Asset                        | Path                                       | Source                                    | Author                                                    | License |
| ---------------------------- | ------------------------------------------ | ----------------------------------------- | --------------------------------------------------------- | ------- |
| Dense Sand (textures)        | `public/assets/materials/fine-sand/`       | https://polyhaven.com/a/dense_sand        | Dimitrios Savva                                           | CC0     |
| Rock Boulder Dry (textures)  | `public/assets/materials/reef-rock/`       | https://polyhaven.com/a/rock_boulder_dry  | Dimitrios Savva (photography), Rico Cilliers (processing) | CC0     |
| Pebbles (textures)           | `public/assets/materials/aquarium-gravel/` | https://polyhaven.com/a/pebbles           | Rob Tuytel                                                | CC0     |
| Gravel (textures)            | `public/assets/materials/aqua-soil/`       | https://polyhaven.com/a/gravel            | Dimitrios Savva                                           | CC0     |
| Eucalyptus Bark (textures)   | `public/assets/materials/driftwood/`       | https://polyhaven.com/a/eucalyptus_bark   | Charlotte Baglioni                                        | CC0     |
| Dark Rock (textures)         | `public/assets/materials/dark-slate/`      | https://polyhaven.com/a/dark_rock         | Amal Kumar                                                | CC0     |
| Lichen Rock (textures)       | `public/assets/materials/layered-rock/`    | https://polyhaven.com/a/lichen_rock       | Rico Cilliers                                             | CC0     |
| Seaside Rock (textures)      | `public/assets/materials/basalt/`          | https://polyhaven.com/a/seaside_rock      | Dimitrios Savva                                           | CC0     |
| Rock Face (textures)         | `public/assets/materials/red-rock/`        | https://polyhaven.com/a/rock_face         | Greg Zaal (photography), Dario Barresi (processing)       | CC0     |
| Rock Pitted Mossy (textures) | `public/assets/materials/limestone/`       | https://polyhaven.com/a/rock_pitted_mossy | Dimitrios Savva (photography), Rico Cilliers (processing) | CC0     |
| Mossy Rock (textures)        | `public/assets/materials/mossy-rock/`      | https://polyhaven.com/a/mossy_rock        | Rob Tuytel                                                | CC0     |
| Bark Willow 02 (textures)    | `public/assets/materials/rough-bark/`      | https://polyhaven.com/a/bark_willow_02    | Charlotte Baglioni                                        | CC0     |
| Bark Brown 02 (textures)     | `public/assets/materials/mossy-wood/`      | https://polyhaven.com/a/bark_brown_02     | Rob Tuytel                                                | CC0     |
| Coast Sand 01 (textures)     | `public/assets/materials/coarse-sand/`     | https://polyhaven.com/a/coast_sand_01     | Rob Tuytel                                                | CC0     |
| Gravel Stones (textures)     | `public/assets/materials/black-gravel/`    | https://polyhaven.com/a/gravel_stones     | Amal Kumar                                                | CC0     |

Material textures are derived from the 2K PNG maps by
`scripts/build_materials.py`: resized (sand 2048 px, others 1024 px), packed
and encoded as KTX2 (UASTC with RDO, Zstandard, mipmaps). `normal.ktx2` is
the OpenGL normal map; `surface.ktx2` packs displacement (R), roughness (G)
and the diffuse map's luminance normalized to 0.5 (B), so scenes keep
choosing the color.

Everything else (fish, plants, corals, shells, starfish, water, light) is
procedural geometry and shaders generated in code.
