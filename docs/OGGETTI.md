# Piante e oggetti

_English version: [OBJECTS.md](OBJECTS.md)._

Ogni pianta e oggetto della vasca è una cartella: un `object.json` che
dice cos'è e, se vuoi, un modello 3D che si apre con Blender o con un
qualsiasi visore glTF. Pochi oggetti semplici (rocce, conchiglie, ciottoli)
non hanno bisogno di un modello: Aquaria li disegna da sola con uno dei suoi
generatori, ogni volta un po' diversi.

Una cartella nuova è un tipo nuovo di oggetto, usabile in qualsiasi scena.
Niente codice.

## La cartella

```
public/assets/objects/<id>/
  object.json      cos'è (obbligatorio)
  model.glb        il modello 3D (facoltativo)
```

Il nome della cartella è il `kind` usato nelle scene, per esempio
`rock`.

## object.json

Quello delle rocce:

```json
{
  "name": "Rocks",
  "category": "object",
  "color": "#7e8580",
  "material": {
    "file": "../../materials/reef-rock/material.json",
    "tileSize": 0.45,
    "displacement": 0.07
  },
  "recipe": { "generator": "rock" },
  "traits": {
    "collision": { "across": 0.58, "up": 0.36, "along": 0.58, "sink": 0, "lift": 0 },
    "tags": ["rock", "algae"],
    "placement": { "bands": [1, 4], "size": [0.25, 0.75] }
  }
}
```

| Campo      | Cos'è                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| `name`     | Il nome nel pannello e nell'editor                                                                     |
| `category` | `plant` (ondeggia, ha un'altezza) o `object` (ha una misura)                                           |
| `model`    | Un file `.glb` o `.gltf` nella cartella                                                                |
| `recipe`   | Quale generatore di Aquaria (`rock`, `shell`, `pebble`) lo disegna, e se vuoi `seeds` e `params`       |
| `color`    | Il suo colore, o una lista tra cui scegliere. `tipColor` colora le punte di una pianta                 |
| `material` | Una texture di superficie (`file`: il percorso di un `material.json`, più `tileSize` e `displacement`) |
| `traits`   | Cos'altro deve sapere Aquaria, vedi sotto                                                              |
| `credit`   | Serve con un modello fatto da altri: autore, fonte e licenza                                           |

Un oggetto ha bisogno di un `model` o di una `recipe`. Con tutti e due,
Aquaria disegna la ricetta e gli altri programmi vedono il modello.

Un modello tiene i suoi materiali; `color` colora solo quello che disegna
una ricetta, a meno che l'oggetto non abbia il tratto `tint`. Se il modello ha più pezzi affiancati al primo livello, ogni
elemento in vasca ne usa uno, per varietà.

Le licenze accettate sono le stesse dei pesci: `CC0-1.0`, `CC-BY-3.0`,
`CC-BY-4.0`, `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `0BSD`,
`Unlicense`. I modelli fatti da altri vanno anche in `ASSETS.md`.

## Tratti

Un tratto è qualcosa che un file 3D non sa dire, come "i pesci qui dentro
si possono nascondere". Ogni valore ha un default, quindi `"sway": {}` va
bene. Un tratto che Aquaria non conosce viene saltato con un avviso; uno
conosciuto con un valore sbagliato ferma il caricamento e dice dove.

### `sway`: si muove con la corrente

| Valore      | Default   | Cos'è                                           |
| ----------- | --------- | ----------------------------------------------- |
| `amount`    | `0.05`    | Quanto si muovono le punte, in metri            |
| `speed`     | `1`       | Quanto in fretta ondeggia (1 = normale)         |
| `attribute` | `"_SWAY"` | Dove il modello dice quanto ondeggia ogni punto |

Un modello i cui punti portano anche `_STRAND`, un valore da 0 a 1 per
tentacolo, muove i tentacoli uno per uno: ognuno con fase e ritmo propri,
in un'onda dalla radice alla punta, mentre l'animale intero si apre e si
chiude piano; e li apre attorno a un pesce che ci si tuffa. Gli anemoni di
`scripts/blender/anemone.py` lo hanno.

### `collision`: i pesci ci girano attorno

Un ellissoide approssimato. Ogni valore è una parte della misura
dell'oggetto.

| Valore   | Default | Cos'è                                                |
| -------- | ------- | ---------------------------------------------------- |
| `solid`  | `true`  | `false` per le cose morbide che i pesci attraversano |
| `across` | `0.5`   | Metà larghezza                                       |
| `up`     | `0.5`   | Metà altezza                                         |
| `along`  | `0.5`   | Metà profondità                                      |
| `sink`   | `0`     | Quanto affonda nella sabbia (negativo = più a fondo) |
| `lift`   | `0`     | Quanto sta in alto il centro rispetto alla base      |

### `tags`: cos'è per un pesce

Una lista di parole: `shelter`, `anemone`, `coral`, `plant`, `algae`,
`rock`, `wood`, `shell`… I pesci scelgono i posti da queste parole, mai
dall'oggetto: un pesce pagliaccio cerca un `anemone`, un pesce spaventato
uno `shelter`. Vedi [Stili di nuoto](NUOTO.md#luoghi-ed-etichette).

### `placement`: dove va e quanto è grande

Si usa quando una scena chiede un certo numero di elementi e lascia ad
Aquaria dove metterli. Una voce della scena può cambiare ognuno di questi
valori.

| Valore   | Default    | Cos'è                                       |
| -------- | ---------- | ------------------------------------------- |
| `on`     | `["sand"]` | Su cosa può stare: `sand`, `rock`           |
| `bands`  | `[0, 4]`   | Fasce di profondità, 0 al vetro, 4 in fondo |
| `size`   | nessuno    | Intervallo di misura in metri (oggetti)     |
| `height` | nessuno    | Intervallo di altezza in metri (piante)     |

`clearance` (metri, predefinito `0.2`) è quanto sta lontano dal vetro e
dalle pareti laterali: hairgrass e muschio dicono `0.02`, così un tappeto
arriva fino al vetro.

`hug` (predefinito `false`) lo stende lungo la roccia su cui cresce, con la
parte superiore rivolta fuori dal pendio, come un corallo incrostante: la
montipora incrostante e gli zoantidi dicono `true`. Sulla sabbia resta
dritto.

Gli zoantidi e la montipora incrostante li fa
`scripts/blender/corals.py`: polipi i cui dischi portano i colori, e una
lamina i cui minuscoli polipi sono una texture grigia moltiplicata per i
suoi colori; lo stesso script impila quelle lamine nella montipora a
piatti e fa i polipi a stella verdi. Le colonie vengono da `scripts/blender/colonies.py`: coralli
ramificati (acropora, il corallo cavolfiore `pocillopora`, la
`table-acropora`, il corallo a dita `finger-montipora`) fino a punte di un altro colore, con i calici dei polipi
dipinti in una texture; un corallo cervello vivo (`platygyra`) ripiegato
in creste e valli a meandri; una spugna a tubi; i detriti di corallo, pezzi
sbiancati e spezzati sparsi sulla sabbia; i coralli molli, piante che
ondeggiano nella corrente: un corallo cuoio (`sarcophyton`) coperto di
polipi e la `xenia` dai tentacoli piumati; e il corallo torcia, una pianta i cui
tentacoli ondeggiano uno per uno come quelli degli anemoni.

### `tint`: il colore tinge il modello

Il colore dell'elemento moltiplica i colori del modello, e un modello
tinto brilla sotto la luce attinica, come i coralli vivi.

| Valore     | Predefinito | Cosa è                                                      |
| ---------- | ----------- | ----------------------------------------------------------- |
| `strength` | `1`         | 0 tiene i colori del modello, 1 prende quello dell'elemento |

I coralli fatti in Blender tengono i loro colori, spostati di poco, e
brillano: `"tint": { "strength": 0.15 }`.

## Oggetti ritirati

Le piante e i coralli da cartone delle prime scene (kelp, seagrass, felci,
coralli a ventaglio…) e le scansioni dei coralli, che sembravano morte, non
ci sono più. La tabella `retired` di `public/assets/objects/index.json` dice
cosa prende il loro posto:

```json
"retired": { "kelp": "ribbon-kelp", "fan-coral": null, "starfish": { "species": "red-sea-star" } }
```

Una scena che ne nomina ancora uno, inclusa, salvata nel browser o
importata, viene aggiornata mentre si carica (`src/scene/retiredObjects.ts`):
la voce prende il suo successore, passando alle piante quando il successore
è una pianta (le dimensioni diventano altezze) o agli animali quando è una
specie; con `null` viene tolta. Gli oggetti ritirati non sono offerti nella
tavolozza dell'editor.

### Aggiungere un tratto

1. Un file in `src/scene/traits/` fatto con `defineTrait`: un id, una riga
   di descrizione, e i suoi valori con i default.
2. Una riga in `TRAITS` (`src/scene/traits/index.ts`) e un test.
3. Il codice che lo usa, in `sim/` o `render/`.
4. Una sezione in questa pagina.

## Texture di superficie

Una cartella di texture in `public/assets/materials/<id>/` contiene
`normal.ktx2`, `surface.ktx2` e un `material.json`:

```json
{
  "name": "Basalt",
  "tileSize": 1,
  "credit": { "author": "…", "source": "https://…", "license": "CC0-1.0" }
}
```

`tileSize` è quanto è grande una ripetizione della texture, in metri; una
scena può mettere il suo. Come farne una nuova:
[Fare una texture nuova](SCRIVERE_SCENE.md#fare-una-texture-nuova).

## Fare un oggetto in Blender

1. Modellalo a grandezza vera, in metri, appoggiato sull'origine.
2. Per una pianta, di' ad Aquaria quali parti ondeggiano: aggiungi un
   attributo chiamato `_SWAY` (Object Data → Attributes → Float, Point) e
   dipingilo da 0 alla base a 1 sulle punte. Senza, i punti più alti
   ondeggiano di più.
3. Esporta in glTF Binary (`.glb`), con Data → Mesh → _Attributes_
   spuntato, così `_SWAY` viene salvato.
4. Crea la cartella, mettici il `.glb` e scrivi `object.json`.
5. Per comprimerlo, `npx @gltf-transform/cli optimize model.glb model.glb
--compress meshopt --join false --flatten false`: senza le ultime due
   opzioni le varianti affiancate si fondono in un'unica pianta larghissima.
   `--texture-compress webp` tiene piccola una texture dentro il file.

Le piante d'acqua dolce sono fatte così, nel codice
(`scripts/blender/freshwater_plants.py` ed `epiphytes.py`). I punti di una
foglia portano i suoi colori, verde alla base e rosso sulle punte della
Rotala; le venature sono una texture grigia dipinta da
`scripts/blender/leafpaint.py` (nervatura centrale chiara, venature
laterali, bordo più chiaro), che Aquaria moltiplica per quei colori. Ogni
pianta dice com'è venata in `LEAVES`, per esempio la Cryptocoryne:

```python
"cryptocoryne": dict(midrib=1.0, veins="pinnate", count=7, vein=0.72, slope=0.5, mottle=0.08, rim=0.05),
```

## Trasformare in file gli oggetti generati

```bash
pnpm export:objects [scena.json ...]
```

Salva ogni oggetto disegnato da una ricetta come `model.glb` nella sua
cartella (tre varianti affiancate, a grandezza vera, con `_SWAY` sulle
piante), così si può aprire e modificare in Blender. Anche le scene con
roccia a blocchi vengono salvate, come `<scena>-blocks.glb`.
