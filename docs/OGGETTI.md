# Piante e oggetti come file

_English version: [OBJECTS.md](OBJECTS.md)._

Una pianta o un oggetto della vasca è una cartella di dati, come una
specie: un modello 3D standard che qualunque programma apre (Blender,
Godot, un visualizzatore glTF), più `object.json`, che dice cosa ne fa
Aquaria. Il modello è facoltativo: un oggetto può essere disegnato invece da
uno dei generatori di Aquaria, le piante e gli oggetti procedurali che
costruisce nel codice, ogni volta in una variante diversa.

> Stato: ogni pianta e oggetto della vasca è una cartella, disegnata dalla
> sua ricetta. Gli oggetti fatti solo di un modello sono elencati ma non
> ancora disegnati, e l'esportazione delle ricette in `.glb` arriva dopo
> (roadmap E3).

## La cartella

```
public/assets/objects/<id>/
  object.json      cos'è e cosa ne fa Aquaria (obbligatorio)
  model.glb        il modello 3D (facoltativo)
public/assets/materials/<id>/
  material.json    nome, dimensione della piastrella, crediti
  normal.ktx2      normal map
  surface.ktx2     R rilievo, G ruvidità, B dettaglio di luminosità
```

Il nome della cartella è l'id dell'oggetto, il `kind` con cui lo chiama una
scena. `object.json` è la fonte di verità: un modello senza non è un
oggetto.

## object.json

```json
{
  "name": "Ludwigia",
  "category": "plant",
  "model": "model.glb",
  "color": ["#4f9a3a", "#5fae44"],
  "material": { "file": "../../materials/mossy-wood/material.json", "tileSize": 0.35 },
  "recipe": { "generator": "stem", "seeds": [0, 999] },
  "traits": {
    "sway": { "amount": 0.08 },
    "collision": { "solid": false },
    "tags": ["plant", "shelter"],
    "placement": { "on": ["sand"], "bands": [1, 3], "height": [0.2, 0.4] }
  },
  "credit": { "author": "…", "source": "https://…", "license": "CC0-1.0" }
}
```

| Campo      | Significato                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`     | Mostrato nel pannello e nella palette dell'editor.                                                                                                                              |
| `category` | `plant` (cresce, ondeggia, ha un'altezza) o `object` (appoggiato, ha una dimensione).                                                                                           |
| `model`    | Un file `.glb` o `.gltf` dentro la cartella.                                                                                                                                    |
| `color`    | Il suo colore, o una tavolozza (`["#7a9a34", "#5f8a2e"]`) da cui ogni elemento ne prende uno; una voce di scena può impostare il suo. `tipColor` colora le punte di una pianta. |
| `material` | `file`: un `material.json`, con un percorso relativo a questo file (deve restare dentro `assets/`); `tileSize` (m) e `displacement` (m) dicono come si stende.                  |
| `recipe`   | Uno dei generatori di Aquaria (`generator`, uno dei tipi di piante o oggetti di oggi), i `seeds` da cui pescare le varianti, i `params`.                                        |
| `traits`   | Le caratteristiche di Aquaria per id, vedi sotto.                                                                                                                               |
| `credit`   | Obbligatorio con un modello: autore, URL della fonte e una licenza che permetta riuso, modifiche e ridistribuzione, anche commerciale.                                          |

Un oggetto ha bisogno di un `model` o di una `recipe`. Con entrambi, Aquaria
disegna le varianti della ricetta e il modello è ciò che vedono gli altri
programmi, e il ripiego.

Licenze: `CC0-1.0`, `CC-BY-3.0`, `CC-BY-4.0`, `MIT`, `Apache-2.0`,
`BSD-2-Clause`, `BSD-3-Clause`, `0BSD`, `Unlicense`. Ogni modello di terzi è
elencato anche in `ASSETS.md`.

## Tratti

Un tratto è una caratteristica che un file 3D non sa dire. Ognuno è un file
in `src/scene/traits/`, registrato per id in `TRAITS`, con un valore
predefinito per ogni parametro: `"sway": {}` è un tratto valido. Un tratto
che Aquaria non conosce (di un altro programma, o di un Aquaria più nuovo)
viene saltato con un avviso in console; uno conosciuto con parametri
sbagliati ferma il caricamento con un messaggio che dice dove.

### `sway`: ondeggia nella corrente come una pianta

| Parametro   | Predefinito | Significato                                                      |
| ----------- | ----------- | ---------------------------------------------------------------- |
| `amount`    | `0.05`      | Quanto si muovono le punte, m (0..0.5).                          |
| `speed`     | `1`         | Ritmo dell'ondeggiamento lento, 1 = quello solito.               |
| `attribute` | `"_SWAY"`   | I pesi di ondeggiamento per punto del modello, vedi _Dipingere_. |

### `collision`: i pesci ci girano intorno

Un ellissoide, ogni misura in proporzione alla dimensione dell'oggetto (il
suo diametro approssimativo).

| Parametro | Predefinito | Significato                                                       |
| --------- | ----------- | ----------------------------------------------------------------- |
| `solid`   | `true`      | `false` per le cose morbide che i pesci attraversano (piante).    |
| `across`  | `0.5`       | Metà larghezza (x).                                               |
| `up`      | `0.5`       | Metà altezza (y).                                                 |
| `along`   | `0.5`       | Metà profondità (z).                                              |
| `sink`    | `0`         | Quanto la base affonda nella sabbia (negativo affonda).           |
| `lift`    | `0`         | Altezza del centro sopra la base (il piano di un corallo tavola). |

### `tags`: cos'è per un pesce

Un elenco, vuoto di default: `shelter`, `anemone`, `coral`, `plant`,
`algae`, `rock`, `wood`… I pesci cercano i posti per tag, mai per oggetto
(un pesce pagliaccio sta vicino a un `anemone`); una voce di scena può
cambiare i tag dei suoi elementi. Vedi [Stili di nuoto](NUOTO.md).

### `placement`: dove va e quanto è grande

Usato quando una scena chiede un certo numero di elementi e lascia al caso
i posti; una voce di scena può cambiare qualunque parametro.

| Parametro | Predefinito | Significato                                  |
| --------- | ----------- | -------------------------------------------- |
| `on`      | `["sand"]`  | Su cosa può stare: `sand`, `rock`.           |
| `bands`   | `[0, 4]`    | Fasce di profondità, 0 al vetro, 4 in fondo. |
| `size`    | nessuno     | Intervallo del diametro, m (oggetti).        |
| `height`  | nessuno     | Intervallo dell'altezza, m (piante).         |

### Aggiungere un tratto

1. Un file in `src/scene/traits/` fatto con `defineTrait`: id, una riga di
   descrizione, uno schema Zod con un valore predefinito per ogni parametro.
2. La sua riga in `TRAITS` (`src/scene/traits/index.ts`) e un test.
3. Il codice che lo esegue, in `sim/` o `render/`, che legge
   `manifest.traits.<id>`.
4. Una sezione in questo file e in OBJECTS.md.

## material.json

```json
{
  "name": "Basalt",
  "tileSize": 1,
  "credit": { "author": "…", "source": "https://…", "license": "CC0-1.0" }
}
```

`textures` (`normal`, `surface`) vale di default `normal.ktx2` e
`surface.ktx2` nella cartella. `tileSize` è la dimensione di una piastrella
della texture in metri; quella di una voce di scena ha la precedenza.

## Fare un oggetto in Blender

1. Modella a grandezza reale, in metri, appoggiato sulla base nell'origine,
   con +Y in alto (l'esportatore glTF trasforma il +Z di Blender in +Y).
2. Per una pianta, dipingi quanto ondeggia ogni punto: aggiungi un
   attributo generico chiamato `_SWAY` (Object Data, Attributes, Float,
   Point) e dipingilo da 0 alla base a 1 sulle punte. Senza, i punti
   ondeggiano di più quanto più sono in alto.
3. Esporta come glTF Binary (`.glb`) con Data, Mesh, _Attributes_ spuntato,
   così `_SWAY` finisce nel file.
4. Crea la cartella, mettici il `.glb` e scrivi `object.json`; aggiungi i
   crediti in `ASSETS.md` se il modello non è tuo.
