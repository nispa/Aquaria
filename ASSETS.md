# Third-party assets

Every third-party asset (models, textures, images, sounds) used in this
repository must be listed here with its source, author and license.
Only licenses that allow reuse, modification and redistribution, also
commercially, are accepted: CC0, CC-BY (3.0 or 4.0), MIT, Apache-2.0, BSD,
0BSD or the Unlicense. Non-commercial (NC), no-derivatives (ND) and
share-alike (SA) licenses are not.

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

## Fish models

Each model is a folder in `public/assets/species/` whose `model.json` repeats
the author, source and license (the unit tests check that the source is
listed here).

| Model                    | Path                                              | Source                                                                                                       | Author        | License   |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------- | --------- |
| Barramundi               | `public/assets/species/barramundi/`               | https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/BarramundiFish                           | Microsoft     | CC0       |
| Neon tetra               | `public/assets/species/neon-tetra/`               | https://sketchfab.com/3d-models/paracheirodon-innesi---tetra-neon-2fabf5db754746b7b81ebfa0bbe99161           | BlueMesh      | CC-BY 4.0 |
| Gilthead seabream        | `public/assets/species/gilthead-seabream/`        | https://sketchfab.com/3d-models/bream-fish-dorade-royale-a3d0e1a597794a9bb74739a13cfc8b77                    | BlueMesh      | CC-BY 4.0 |
| Guppy                    | `public/assets/species/guppy/`                    | https://github.com/nispa/Aquaria/blob/main/scripts/blender/guppy.py                                         | Aquaria       | CC0       |
| Copperband butterflyfish | `public/assets/species/copperband-butterflyfish/` | https://sketchfab.com/3d-models/small-fish-8f5de32946f347a0b6c8e55c6a66d46d                                  | The SpezX     | CC-BY 4.0 |
| Clownfish                | `public/assets/species/clownfish/`                | https://sketchfab.com/3d-models/animated-swimming-tropical-fish-school-loop-62ccf83b35c744d7b5ffb7be80d4ea99 | LasquetiSpice | CC-BY 4.0 |
| Powder blue tang         | `public/assets/species/blue-tang/`                | https://sketchfab.com/3d-models/animated-swimming-tropical-fish-school-loop-62ccf83b35c744d7b5ffb7be80d4ea99 | LasquetiSpice | CC-BY 4.0 |
| Moorish idol             | `public/assets/species/moorish-idol/`             | https://sketchfab.com/3d-models/animated-swimming-tropical-fish-school-loop-62ccf83b35c744d7b5ffb7be80d4ea99 | LasquetiSpice | CC-BY 4.0 |
| Yellow tang              | `public/assets/species/yellow-tang/`              | https://sketchfab.com/3d-models/animated-swimming-tropical-fish-school-loop-62ccf83b35c744d7b5ffb7be80d4ea99 | LasquetiSpice | CC-BY 4.0 |
| Freshwater angelfish     | `public/assets/species/freshwater-angelfish/`     | https://github.com/nispa/Aquaria/blob/main/scripts/blender/angelfish.py                                    | Aquaria       | CC0       |
| Royal gramma             | `public/assets/species/royal-gramma/`             | https://github.com/nispa/Aquaria/blob/main/scripts/blender/royal_gramma.py                                  | Aquaria       | CC0       |
| Sardine                  | `public/assets/species/sardine/`                  | https://github.com/nispa/Aquaria/blob/main/scripts/blender/sardine.py                                       | Aquaria       | CC0       |
| Sea turtle               | `public/assets/animals/sea-turtle/`               | https://sketchfab.com/3d-models/sea-turtle-23dcb315dea44f5082b020b04710bd31                                  | Eloi          | CC-BY 4.0 |

All were optimized with glTF Transform (meshopt geometry, KTX2 textures at
1024 px; see README, "3D fish models"); the seabream's specular-glossiness
material was first converted to metallic-roughness. Skeletons and swim
animations are not used: the rest pose is baked and the engine swims the
model.

Credits for the CC-BY models, as their licenses ask:

- "Paracheirodon Innesi _ Tetra Neon"
  (https://sketchfab.com/3d-models/paracheirodon-innesi---tetra-neon-2fabf5db754746b7b81ebfa0bbe99161)
  by BlueMesh (https://sketchfab.com/VapTor), licensed under CC-BY-4.0
  (http://creativecommons.org/licenses/by/4.0/).
- "Bream Fish ( Dorade Royale)"
  (https://sketchfab.com/3d-models/bream-fish-dorade-royale-a3d0e1a597794a9bb74739a13cfc8b77)
  by BlueMesh (https://sketchfab.com/VapTor), licensed under CC-BY-4.0.
- "Sea Turtle"
  (https://sketchfab.com/3d-models/sea-turtle-23dcb315dea44f5082b020b04710bd31)
  by Eloi (https://sketchfab.com/Eloiart), licensed under CC-BY-4.0.
- "Small fish"
  (https://sketchfab.com/3d-models/small-fish-8f5de32946f347a0b6c8e55c6a66d46d)
  by The SpezX (https://sketchfab.com/SpezX), licensed under CC-BY-4.0.
- "Animated Swimming Tropical Fish School Loop"
  (https://sketchfab.com/3d-models/animated-swimming-tropical-fish-school-loop-62ccf83b35c744d7b5ffb7be80d4ea99)
  by LasquetiSpice (https://sketchfab.com/LasquetiSpice), licensed under
  CC-BY-4.0. One fish of each species was extracted from the school (the
  vertices bound to its bones), without the skeleton and animation.

Everything else (procedural fish, plants, corals, shells, starfish, water,
light) is procedural geometry and shaders generated in code.
