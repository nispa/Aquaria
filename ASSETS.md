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

## Plant, stone and wood models

Made in code with Blender by the scripts in `scripts/blender/`.

| Model                      | Path                                           | Source                                                                          | Author  | License |
| -------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- | ------- | ------- |
| Ribbon kelp                | `public/assets/objects/ribbon-kelp/`           | https://github.com/nispa/Aquaria/blob/main/scripts/blender/kelp.py              | Aquaria | CC0     |
| Turtle grass               | `public/assets/objects/turtle-grass/`          | https://github.com/nispa/Aquaria/blob/main/scripts/blender/seagrass.py          | Aquaria | CC0     |
| Sea lettuce                | `public/assets/objects/sea-lettuce/`           | https://github.com/nispa/Aquaria/blob/main/scripts/blender/sea_lettuce.py       | Aquaria | CC0     |
| Bubble-tip anemone         | `public/assets/objects/bubble-tip-anemone/`    | https://github.com/nispa/Aquaria/blob/main/scripts/blender/anemone.py           | Aquaria | CC0     |
| Magnificent anemone        | `public/assets/objects/magnificent-anemone/`   | https://github.com/nispa/Aquaria/blob/main/scripts/blender/anemone.py           | Aquaria | CC0     |
| Carpet anemone             | `public/assets/objects/carpet-anemone/`        | https://github.com/nispa/Aquaria/blob/main/scripts/blender/anemone.py           | Aquaria | CC0     |
| Long-tentacle anemone      | `public/assets/objects/long-tentacle-anemone/` | https://github.com/nispa/Aquaria/blob/main/scripts/blender/anemone.py           | Aquaria | CC0     |
| Zoanthids                  | `public/assets/objects/zoanthids/`             | https://github.com/nispa/Aquaria/blob/main/scripts/blender/corals.py            | Aquaria | CC0     |
| Encrusting montipora       | `public/assets/objects/encrusting-montipora/`  | https://github.com/nispa/Aquaria/blob/main/scripts/blender/corals.py            | Aquaria | CC0     |
| Acropora                   | `public/assets/objects/acropora/`              | https://github.com/nispa/Aquaria/blob/main/scripts/blender/colonies.py          | Aquaria | CC0     |
| Brain coral (living)       | `public/assets/objects/platygyra/`             | https://github.com/nispa/Aquaria/blob/main/scripts/blender/colonies.py          | Aquaria | CC0     |
| Torch coral                | `public/assets/objects/torch-coral/`           | https://github.com/nispa/Aquaria/blob/main/scripts/blender/colonies.py          | Aquaria | CC0     |
| Cauliflower coral (living) | `public/assets/objects/pocillopora/`           | https://github.com/nispa/Aquaria/blob/main/scripts/blender/colonies.py          | Aquaria | CC0     |
| Table acropora             | `public/assets/objects/table-acropora/`        | https://github.com/nispa/Aquaria/blob/main/scripts/blender/colonies.py          | Aquaria | CC0     |
| Plating montipora          | `public/assets/objects/plating-montipora/`     | https://github.com/nispa/Aquaria/blob/main/scripts/blender/corals.py            | Aquaria | CC0     |
| Green star polyps          | `public/assets/objects/star-polyps/`           | https://github.com/nispa/Aquaria/blob/main/scripts/blender/corals.py            | Aquaria | CC0     |
| Finger coral (living)      | `public/assets/objects/finger-montipora/`      | https://github.com/nispa/Aquaria/blob/main/scripts/blender/colonies.py          | Aquaria | CC0     |
| Tube sponge                | `public/assets/objects/tube-sponge/`           | https://github.com/nispa/Aquaria/blob/main/scripts/blender/colonies.py          | Aquaria | CC0     |
| Coral rubble               | `public/assets/objects/coral-rubble/`          | https://github.com/nispa/Aquaria/blob/main/scripts/blender/colonies.py          | Aquaria | CC0     |
| Leather coral (living)     | `public/assets/objects/sarcophyton/`           | https://github.com/nispa/Aquaria/blob/main/scripts/blender/colonies.py          | Aquaria | CC0     |
| Xenia                      | `public/assets/objects/xenia/`                 | https://github.com/nispa/Aquaria/blob/main/scripts/blender/colonies.py          | Aquaria | CC0     |
| Seiryu stones              | `public/assets/objects/seiryu-stone/`          | https://github.com/nispa/Aquaria/blob/main/scripts/blender/seiryu.py            | Aquaria | CC0     |
| Branching driftwood        | `public/assets/objects/branching-driftwood/`   | https://github.com/nispa/Aquaria/blob/main/scripts/blender/driftwood.py         | Aquaria | CC0     |
| Rotala                     | `public/assets/objects/rotala/`                | https://github.com/nispa/Aquaria/blob/main/scripts/blender/freshwater_plants.py | Aquaria | CC0     |
| Dwarf hairgrass            | `public/assets/objects/hairgrass/`             | https://github.com/nispa/Aquaria/blob/main/scripts/blender/freshwater_plants.py | Aquaria | CC0     |
| Cryptocoryne               | `public/assets/objects/cryptocoryne/`          | https://github.com/nispa/Aquaria/blob/main/scripts/blender/freshwater_plants.py | Aquaria | CC0     |
| Vallisneria                | `public/assets/objects/vallisneria/`           | https://github.com/nispa/Aquaria/blob/main/scripts/blender/freshwater_plants.py | Aquaria | CC0     |
| Anubias                    | `public/assets/objects/anubias/`               | https://github.com/nispa/Aquaria/blob/main/scripts/blender/epiphytes.py         | Aquaria | CC0     |
| Java fern                  | `public/assets/objects/java-fern/`             | https://github.com/nispa/Aquaria/blob/main/scripts/blender/epiphytes.py         | Aquaria | CC0     |
| Moss cushion               | `public/assets/objects/moss-cushion/`          | https://github.com/nispa/Aquaria/blob/main/scripts/blender/epiphytes.py         | Aquaria | CC0     |

## Ambient sounds

Each sound is a folder in `public/sounds/` whose `sound.json` repeats the
author, source and license. The recordings were cut to a loop, mixed to
mono, levelled and encoded as MP3 for Aquaria.

| Sound         | Path                            | Source                                              | Author                       | License |
| ------------- | ------------------------------- | --------------------------------------------------- | ---------------------------- | ------- |
| Under the sea | `public/sounds/underwater-sea/` | https://freesound.org/people/Kinoton/sounds/393819/ | Kinoton                      | CC0     |
| Aquarium pump | `public/sounds/aquarium-pump/`  | https://freesound.org/people/vquera/sounds/463477/  | vquera                       | CC0     |
| Small stream  | `public/sounds/small-stream/`   | https://bigsoundbank.com/small-stream-s0823.html    | BigSoundBank (Joseph Sardin) | CC0     |

## Fish models

Each model is a folder in `public/assets/species/` whose `model.json` repeats
the author, source and license (the unit tests check that the source is
listed here).

| Model                    | Path                                              | Source                                                                                                       | Author                    | License   |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------- | --------- |
| Barramundi               | `public/assets/species/barramundi/`               | https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/BarramundiFish                           | Microsoft                 | CC0       |
| Neon tetra               | `public/assets/species/neon-tetra/`               | https://sketchfab.com/3d-models/paracheirodon-innesi---tetra-neon-2fabf5db754746b7b81ebfa0bbe99161           | BlueMesh                  | CC-BY 4.0 |
| Gilthead seabream        | `public/assets/species/gilthead-seabream/`        | https://sketchfab.com/3d-models/bream-fish-dorade-royale-a3d0e1a597794a9bb74739a13cfc8b77                    | BlueMesh                  | CC-BY 4.0 |
| Guppy                    | `public/assets/species/guppy/`                    | https://github.com/nispa/Aquaria/blob/main/public/assets/species/guppy/fish.json                             | Aquaria                   | CC0       |
| Copperband butterflyfish | `public/assets/species/copperband-butterflyfish/` | https://sketchfab.com/3d-models/small-fish-8f5de32946f347a0b6c8e55c6a66d46d                                  | The SpezX                 | CC-BY 4.0 |
| Clownfish                | `public/assets/species/clownfish/`                | https://sketchfab.com/3d-models/animated-swimming-tropical-fish-school-loop-62ccf83b35c744d7b5ffb7be80d4ea99 | LasquetiSpice             | CC-BY 4.0 |
| Powder blue tang         | `public/assets/species/blue-tang/`                | https://sketchfab.com/3d-models/animated-swimming-tropical-fish-school-loop-62ccf83b35c744d7b5ffb7be80d4ea99 | LasquetiSpice             | CC-BY 4.0 |
| Moorish idol             | `public/assets/species/moorish-idol/`             | https://sketchfab.com/3d-models/animated-swimming-tropical-fish-school-loop-62ccf83b35c744d7b5ffb7be80d4ea99 | LasquetiSpice             | CC-BY 4.0 |
| Yellow tang              | `public/assets/species/yellow-tang/`              | https://sketchfab.com/3d-models/animated-swimming-tropical-fish-school-loop-62ccf83b35c744d7b5ffb7be80d4ea99 | LasquetiSpice             | CC-BY 4.0 |
| Royal gramma             | `public/assets/species/royal-gramma/`             | https://github.com/nispa/Aquaria/blob/main/public/assets/species/royal-gramma/fish.json                      | Aquaria                   | CC0       |
| Sardine                  | `public/assets/species/sardine/`                  | https://github.com/nispa/Aquaria/blob/main/public/assets/species/sardine/fish.json                           | Aquaria                   | CC0       |
| Sea turtle               | `public/assets/animals/sea-turtle/`               | https://sketchfab.com/3d-models/sea-turtle-23dcb315dea44f5082b020b04710bd31                                  | Eloi                      | CC-BY 4.0 |
| Freshwater angelfish     | `public/assets/species/freshwater-angelfish/`     | https://github.com/nispa/Aquaria/blob/main/public/assets/species/freshwater-angelfish/fish.json              | Aquaria                   | CC0       |
| Platy                    | `public/assets/species/platy/`                    | https://github.com/nispa/Aquaria/blob/main/public/assets/species/platy/fish.json                             | Aquaria                   | CC0       |
| Harlequin rasbora        | `public/assets/species/harlequin-rasbora/`        | https://github.com/nispa/Aquaria/blob/main/public/assets/species/harlequin-rasbora/fish.json                 | Aquaria                   | CC0       |
| Red cherry shrimp        | `public/assets/species/red-cherry-shrimp/`        | https://github.com/nispa/Aquaria/blob/main/scripts/blender/shrimp.py                                         | Aquaria                   | CC0       |
| Hermit crab              | `public/assets/species/hermit-crab/`              | https://sketchfab.com/3d-models/hermit-crab-7e71ce922fd44ab8b9221737e9618361                                 | kenchoo                   | CC-BY 4.0 |
| Freshwater crab          | `public/assets/species/freshwater-crab/`          | https://sketchfab.com/3d-models/cc0-japanese-freshwater-crab-35559c2236d04c1a80ccbe08cae863c6                | ffish.asia / floraZia.com | CC0       |

All of them were compressed with glTF Transform (meshopt geometry, KTX2
textures, 1024 px, or 512 px for the crabs, which are small on the bottom;
see [docs/FISH_MODELS.md](docs/FISH_MODELS.md)). Some were changed first, by
scripts in `scripts/blender/`:

- seabream (`seabream.py`): the widest-open pose of its jaw animation became
  a `MouthOpen` shape key, and its specular-glossiness material was
  converted;
- barramundi (`barramundi.py`): an open, protruding mouth shaped by hand;
- hermit crab (`hermit_crab.py`): a new walk and a pose for hiding in the
  shell, in place of its idle animation;
- clownfish, powder blue tang, moorish idol and yellow tang (`tropical_fish.py`):
  one fish of each species extracted from the school with its own bones and a
  short in-place `Swim` clip looped from the school's animation.

Fish are drawn in their rest pose and bent by the engine; only the animals
that walk (shrimps, crabs) play animations.

Credits for the CC-BY models, as their licenses ask:

- "Paracheirodon Innesi _ Tetra Neon"
  (https://sketchfab.com/3d-models/paracheirodon-innesi---tetra-neon-2fabf5db754746b7b81ebfa0bbe99161)
  by BlueMesh (https://sketchfab.com/VapTor), licensed under CC-BY-4.0
  (http://creativecommons.org/licenses/by/4.0/).
- "Bream Fish ( Dorade Royale)"
  (https://sketchfab.com/3d-models/bream-fish-dorade-royale-a3d0e1a597794a9bb74739a13cfc8b77)
  by BlueMesh (https://sketchfab.com/VapTor), licensed under CC-BY-4.0.
- "Hermit Crab"
  (https://sketchfab.com/3d-models/hermit-crab-7e71ce922fd44ab8b9221737e9618361)
  by kenchoo (https://sketchfab.com/kenchoo), licensed under CC-BY-4.0.
- "Sea Turtle"
  (https://sketchfab.com/3d-models/sea-turtle-23dcb315dea44f5082b020b04710bd31)
  by Eloi (https://sketchfab.com/Eloiart), licensed under CC-BY-4.0.
- "Small fish"
  (https://sketchfab.com/3d-models/small-fish-8f5de32946f347a0b6c8e55c6a66d46d)
  by The SpezX (https://sketchfab.com/SpezX), licensed under CC-BY-4.0.
- "Animated Swimming Tropical Fish School Loop"
  (https://sketchfab.com/3d-models/animated-swimming-tropical-fish-school-loop-62ccf83b35c744d7b5ffb7be80d4ea99)
  by LasquetiSpice (https://sketchfab.com/LasquetiSpice), licensed under
  CC-BY-4.0. One fish of each species was extracted from the school with its
  own bones and a short in-place `Swim` clip looped from the school's animation.

Everything else (procedural fish, plants, corals, shells, starfish, water,
light) is procedural geometry and shaders generated in code.
