# Piante e oggetti

_English version: [OBJECTS.md](OBJECTS.md)._

Ogni pianta e oggetto della vasca è una cartella: un `object.json` che
dice cos'è e, se vuoi, un modello 3D che si apre con Blender o con un
qualsiasi visore glTF. Senza modello, Aquaria disegna l'oggetto da sola
con uno dei suoi generatori, ogni volta un po' diverso.

Una cartella nuova è un tipo nuovo di oggetto, usabile in qualsiasi scena.
Niente codice.

## La cartella

```
public/assets/objects/<id>/
  object.json      cos'è (obbligatorio)
  model.glb        il modello 3D (facoltativo)
```

Il nome della cartella è il `kind` usato nelle scene, per esempio
`driftwood`.

## object.json

Quello del legno:

```json
{
  "name": "Driftwood",
  "category": "object",
  "color": "#5a4636",
  "material": { "file": "../../materials/mossy-wood/material.json", "tileSize": 0.35 },
  "recipe": { "generator": "driftwood" },
  "traits": {
    "collision": { "across": 0.55, "up": 0.5, "along": 0.48, "sink": -0.02, "lift": 0 },
    "tags": ["wood", "shelter"],
    "placement": { "bands": [1, 3], "size": [0.5, 1.1] }
  }
}
```

| Campo      | Cos'è                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| `name`     | Il nome nel pannello e nell'editor                                                                     |
| `category` | `plant` (ondeggia, ha un'altezza) o `object` (ha una misura)                                           |
| `model`    | Un file `.glb` o `.gltf` nella cartella                                                                |
| `recipe`   | Quale generatore di Aquaria lo disegna, e se vuoi `seeds` e `params`                                   |
| `color`    | Il suo colore, o una lista tra cui scegliere. `tipColor` colora le punte di una pianta                 |
| `material` | Una texture di superficie (`file`: il percorso di un `material.json`, più `tileSize` e `displacement`) |
| `traits`   | Cos'altro deve sapere Aquaria, vedi sotto                                                              |
| `credit`   | Serve con un modello fatto da altri: autore, fonte e licenza                                           |

Un oggetto ha bisogno di un `model` o di una `recipe`. Con tutti e due,
Aquaria disegna la ricetta e gli altri programmi vedono il modello.

Un modello tiene i suoi materiali; `color` colora solo quello che disegna
una ricetta. Se il modello ha più pezzi affiancati al primo livello, ogni
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

## Trasformare in file gli oggetti generati

```bash
pnpm export:objects [scena.json ...]
```

Salva ogni oggetto disegnato da una ricetta come `model.glb` nella sua
cartella (tre varianti affiancate, a grandezza vera, con `_SWAY` sulle
piante), così si può aprire e modificare in Blender. Anche le scene con
roccia a blocchi vengono salvate, come `<scena>-blocks.glb`.
