# Scrivere scene e specie

_English version: [SCENES.md](SCENES.md)._

L'editor delle scene (`E`) copre quasi tutto quello che una scena può
contenere. Questa pagina serve quando vuoi aprire direttamente i file: per
includere una scena nuova in Aquaria, aggiungere una specie, o regolare
qualcosa che l'editor non mostra.

Ogni file viene controllato quando si carica. Se qualcosa non va,
l'acquario si ferma e ti dice quale campo, in quale file.

## Dove stanno le cose

| File                            | Cosa contiene                                                          |
| ------------------------------- | ---------------------------------------------------------------------- |
| `public/scenes/<id>.json`       | Una scena                                                              |
| `public/scenes/index.json`      | Le scene del pannello, a gruppi; la prima è quella di partenza         |
| `public/species.json`           | Tutte le specie                                                        |
| `public/assets/objects/<id>/`   | Una pianta o un oggetto ([Piante e oggetti](OGGETTI.md))               |
| `public/assets/species/<id>/`   | Il modello 3D di una specie ([Modelli 3D](MODELLI_PESCI.md))           |
| `public/assets/materials/<id>/` | Una texture di superficie: sabbia, roccia, legno                       |
| `public/looks/<id>.json`        | Un look: esposizione, sole, impostazioni degli effetti ([Look](#look)) |

Su un telefono Aquaria apre la scena indicata da `phone` in `index.json`
(il Nano reef, una vasca piccola che un telefono disegna bene), a meno che
l'URL o l'ultima scelta di chi guarda non ne indichino un'altra.

Una scena salvata nell'editor resta nel browser, non in questi file. Per
includerla, usa **Export JSON** nella scheda Scene dell'editor, copia il
file in `public/scenes/` e aggiungi il suo id a `index.json`.

## Le misure

Tutto è in metri. `x` va lungo il vetro, `y` dalla sabbia alla superficie,
`z` dal vetro verso il fondo della vasca.

La profondità è divisa anche in cinque **fasce**: 0 è subito dietro il
vetro, 4 è in fondo. Piante, oggetti e pesci usano le fasce per dire dove
stanno.

### Dimensione della vasca

Una scena è scritta per una vasca, ma chi guarda può vederla in un'altra:
nella scheda Tank del pannello c'è la scelta **Tank size**, e `?size=nano`
fa lo stesso dall'indirizzo. Le dimensioni sono `nano` (40 × 30 × 30 cm),
`small` (60 × 40 × 40 cm), `medium` (120 × 60 × 50 cm), `large` (240 × 110
× 100 cm) e `ocean` (6 × 3,2 × 3,2 m). Una scena può dire per quale è
scritta con `"size": "large"`; senza, si usa quella più vicina alle misure
di `tank`.

I pesci restano della loro misura vera, quindi in una vasca più piccola ce
ne sono meno: il numero segue la radice quadrata del volume, un branco non
scende sotto i tre e una specie che non ci sta più viene lasciata fuori.
Piante e oggetti mantengono la densità, quindi il loro numero segue l'area
del fondo; le piante seguono l'altezza della vasca e non superano l'80%
della sua altezza, pietre e legni si rimpiccioliscono un poco. I punti
scelti (`at`) si spostano con la vasca. Dai a un oggetto una `size` perché
possa seguirla: senza, tiene quella predefinita. Una scena con la roccia
fatta di blocchi ha una forma fissa e tiene la sua vasca.

Una vasca `nano`, `small` o `medium` sta in una stanza, quindi una scena di
acqua aperta vista in una di queste dimensioni riceve un pannello sul vetro
di fondo, con i colori del suo sfondo (vedi
[Il fondo e il retro](#il-fondo-e-il-retro)).

## Una scena

Breve ma completa:

```jsonc
{
  "id": "reef",
  "name": "Tropical reef",
  "seed": 20260929,
  "tank": { "width": 5.4, "height": 3, "depth": 4 },
  "water": { "color": "#0a5a7a", "fogDensity": 0.13 },
  "light": { "color": "#fff4dc", "intensity": 1.3, "caustics": { "intensity": 0.9, "scale": 1.4 } },
  "current": { "direction": [1, 0, 0.2], "strength": 0.04, "turbulence": 0.35 },
  "backdrop": { "type": "gradient", "top": "#1a86a8", "bottom": "#021a2a" },
  "floor": { "color": "#d8c49a" },
  "flora": [
    { "kind": "kelp", "count": 10, "bands": [3, 4], "height": [1.4, 2.7], "color": "#5a9a3e" },
  ],
  "props": [{ "kind": "brain-coral", "count": 4, "color": "#b8a05a" }],
  "fauna": [{ "species": "sardine", "count": 45 }],
}
```

- `seed` decide la disposizione casuale. Stesso seed, stessa vasca.
- `water.fogDensity` è quanto è torbida l'acqua. `water.surface` (da 0
  a 1) è quanto si vede la superficie da sotto; tienilo basso negli
  acquari. `water.bubbles: false` toglie le colonne di bolle.
- `water.pearling` (da 0 a 1) è quanto perlano le piante: in un pomeriggio
  luminoso, dopo circa tre ore di luce, bollicine di ossigeno minuscole si
  formano sulle foglie, si staccano e salgono. `0.6` nella Planted tank;
  predefinito `0`.
- `current` piega le piante, muove le particelle e spinge un poco i pesci.

### Piante e oggetti

`flora` contiene le piante, `props` tutto il resto. Ogni voce è un gruppo
dello stesso tipo:

```json
{ "kind": "driftwood", "count": 3, "bands": [1, 2], "color": "#5a4636" }
```

- `kind` è il nome di una cartella in `public/assets/objects/`: `kelp`,
  `seagrass`, `anemone`, `carpet`, `fern`, `stem`, `rock`, `shell`,
  `brain-coral`, `driftwood`, `pebble` e altri. L'elenco completo è la
  cartella stessa. Una cartella nuova è un tipo nuovo.
- `count`, `bands` e `color` dicono quanti, dove e di che colore. `color`
  può essere anche una lista: ogni elemento ne sceglie uno.
- `height` (piante) o `size` (oggetti) è un intervallo `[min, max]` in
  metri. Se manca, si usa quello dell'oggetto.
- `tipColor` colora la cima delle foglie di una pianta.
- `name` è l'etichetta nel pannello.
- `tags` cambia quello che l'elemento significa per i pesci, per esempio
  per fare di un mucchio di rocce un nascondiglio:
  `"tags": ["rock", "shelter"]`. Vedi [Stili di nuoto](NUOTO.md#luoghi-ed-etichette).

Gli elementi vanno in punti a caso nelle loro fasce. Per sceglierli tu,
elencali in `at`; la voce mette un elemento per punto:

```json
{
  "kind": "anemone",
  "count": 2,
  "at": [
    { "x": -0.8, "z": -0.6 },
    { "x": 1.2, "z": -1.1, "rotation": 30 }
  ]
}
```

`x` si misura dal centro della vasca, `z` dal vetro. Un punto può avere
anche `height`, `size`, oppure `y` per sollevare l'elemento dalla sabbia
(in una grotta, per esempio). Altrimenti poggia su quello che ha sotto.

### Superfici

Il fondo, e le voci di rocce o legni, possono usare una texture
fotografica:

```json
"floor": { "color": "#c8b48a", "material": { "id": "fine-sand", "tileSize": 0.6 } }
```

`tileSize` è quanto è grande una ripetizione della texture, in metri.
`displacement` (in metri) rende la superficie in rilievo. `color` decide
ancora la tinta. Le texture disponibili sono le cartelle di
`public/assets/materials/`: sabbie e ghiaie (`fine-sand`, `coarse-sand`,
`aquarium-gravel`, `black-gravel`, `aqua-soil`), rocce (`reef-rock`,
`limestone`, `dark-slate`, `layered-rock`, `basalt`, `red-rock`,
`mossy-rock`) e legni (`driftwood`, `rough-bark`, `mossy-wood`).

### Il fondo e il retro

La sabbia ha dune leggere. In una vasca più bassa di una `large` si
rimpiccioliscono con lei, così una nano non ha dune di 12 cm. Due campi di
`floor` cambiano la sua forma:

```json
"floor": { "color": "#5a4a3a", "rise": 0.15, "dunes": 0.5 }
```

- `rise` alza il fondo verso il retro, come parte dell'altezza della vasca:
  `0.15` nella Planted tank sono 16 cm in fondo a una vasca di 110 cm.
  Parte piatto al vetro e torna piano in fondo. Predefinito `0`.
- `dunes` è quanto sono forti le dune: `1` è il solito (predefinito), `0`
  un fondo piatto, `2` alte il doppio.

`backdrop` dice cosa c'è dietro la vasca. Un `gradient` è acqua aperta: la
sabbia continua in lontananza, verso un muro di colore lontano. Un `panel`
è una vasca di casa: un pannello incollato al vetro di fondo, e la sabbia
finisce lì.

```json
"backdrop": { "type": "panel", "top": "#16201c", "bottom": "#050806" }
```

`top` e `bottom` sono i colori alla superficie e alla sabbia; dai lo stesso
colore a entrambi per un pannello in tinta unita (nero, o bianco satinato).
I vetri laterali riflettono il fondo, quindi la sabbia continua anche un
po' ai lati.

### La roccia

Ci sono due modi di costruire la roccia:

- `blocks`: roccia fatta di cubi, smussata in pietra con grotte e
  sporgenze. È quella che costruisce l'editor. Raramente la scriverai a
  mano: costruiscila nell'editor ed esporta la scena.
- `rockwork`: una vecchia cresta di barriera generata, che attraversa la
  vasca. Prende `bands`, un intervallo `height` per la cresta, `coverage`
  (quanto della larghezza copre), `thickness`, `rocks`, `color` e
  `material`. L'editor la può trasformare in blocchi.

Piante e oggetti con `"on": "rockwork"` crescono sulla roccia invece che
sulla sabbia, dentro le `bands` della loro voce: un banco a metà vasca e le
cime delle colonne dietro possono avere ciascuno i propri coralli. Dove la
roccia non ha posto nelle bande, crescono sulla sabbia.

Entrambe possono essere roccia viva: `growth` dipinge alghe sulle facce
rivolte alla luce, croste rosa di alga corallina a chiazze e fessure più
scure sotto le sporgenze. `"growth": {}` prende i valori predefiniti; la
scena Hero usa quelli.

| Valore           | Predefinito | Cosa è                                              |
| ---------------- | ----------- | --------------------------------------------------- |
| `algae`          | `0.6`       | Quanto delle facce rivolte in alto coprono le alghe |
| `algaeColor`     | `#4d6b2c`   | Il loro colore                                      |
| `coralline`      | `0.3`       | Quanto della roccia ricopre la corallina            |
| `corallineColor` | `#b4708e`   | Il suo colore                                       |
| `patch`          | `0.35`      | Grandezza delle chiazze, m                          |

Le colonne della scena Hero le genera `scripts/hero_pillars.py`: cambia lì
le colonne e rilancialo su `public/scenes/hero.json`.

### Le luci

Una scena può suggerire le sue luci. Chi guarda le può cambiare dal
pannello; **Recommended** torna a queste.

```jsonc
"lights": {
  "channels": { "white": { "level": 1 }, "blue": { "level": 0.2 }, "violet": { "level": 0 } },
  "moon": 0.05,
  "fixture": { "type": "sun" },
  "cycle": { "mode": "clock", "sunrise": 8, "sunset": 20, "ramp": 1.5 }
}
```

- `channels`: bianco, blu, viola e un colore libero `accent`, ognuno con un
  `level` e, se vuoi, un `color`.
- `fixture`: `{ "type": "sun" }` per il mare aperto, oppure
  `{ "type": "spots", "spots": 6 }` per una fila di faretti LED sopra la
  vasca.
- `cycle.mode`: `startup` (l'ora in cui si è aperto l'acquario, poi
  ferma), `fixed` (sempre `hour`), `clock` (l'ora vera) o `accelerated`
  (una giornata intera ogni `minutes`). `sunrise` e `sunset` sono ore;
  `ramp` è quanto durano alba e tramonto, in ore.

Tutti i campi sono facoltativi; la [Guida all'uso](GUIDA_UTENTE.md#light)
spiega come appaiono.

### Look

Una scena può nominare un look, un file in `public/looks/`: `"look": "hero"`.
Il look dice come si disegna la scena: quanto è luminosa, dov'è il sole e
le impostazioni degli effetti. La scena Hero usa `public/looks/hero.json`:

```jsonc
{
  "name": "Hero",
  "exposure": 0.72,
  "sun": [0.02, 0.62, -1],
  "features": { "waves": true },
  "effects": {
    "underwater": { "strength": 1, "absorption": [0.5, 0.24, 0.2], "shafts": 0.9 },
    "finish": { "vignette": 0.75, "contrast": 1.15, "saturation": 1.15 },
  },
}
```

- `exposure`: sotto 1 è più scuro. Senza look vale 1.05.
- `snow`: quanta neve marina c'è nell'acqua, da 0 (cristallina, una vasca
  di casa) a 1 (il mare aperto, anche senza look) fino a 3 (torbida).
- `sun`: da dove arriva la luce del sole, visto dal centro della vasca
  (`x` a destra, `y` in alto, `z` verso il vetro). Qui è alto e dietro,
  così brilla attraverso la superficie in cima all'immagine.
- `features`: cosa la scena accende (`true`) o spegne (`false`) alla
  partenza. Gli interruttori del pannello scelti da chi guarda vincono.
- `effects`: impostazioni per id dell'effetto. Quello che manca resta al
  valore predefinito. Gli [effetti](EFFETTI.md) elencano le loro impostazioni.

La Planted tank e l'Iwagumi usano `public/looks/planted.json`, una vasca
di casa d'acqua dolce: acqua limpida che sbiadisce appena, niente neve
marina, niente raggi di sole, niente onde, una luce bianca dritta
dall'alto. Il look da solo non basta: la scena dà anche all'acqua un
`color` grigio-verde scuro con poca nebbia (`fogDensity` 0.12), una
`surface` calma (0.08), uno sfondo quasi nero e una plafoniera `"sun"`,
così sopra l'acqua non si vede una fila di faretti.

I look elencati in `public/looks/index.json` si possono anche scegliere
nella sezione Look del pannello, per qualunque scena, con uno slider per
ogni impostazione.

L'effetto `underwater` è quello che fa il mare aperto: il rosso sparisce
per primo, le cose lontane si sciolgono nella luce dell'acqua e i raggi del
sole si aprono a ventaglio. Resta spento finché un look non ne imposta la
`strength`.

## Una specie

Le specie stanno in `public/species.json`. Questa è la royal gramma, così
com'è nel file:

```json
{
  "id": "royal-gramma",
  "name": "Royal gramma",
  "body": {
    "type": "procedural",
    "shape": "slender",
    "pattern": "split",
    "colors": { "base": "#8a2bd8", "accent": "#ffc21a" }
  },
  "model": "royal-gramma",
  "length": { "mean": 0.08, "standardDeviation": 0.008 },
  "speed": { "cruise": 0.15, "max": 0.45 },
  "schooling": 0,
  "bands": [0, 2],
  "heightRange": [0.08, 0.35],
  "behavior": { "appetite": 0.6, "curiosity": 0.2, "shyness": 0.8, "hiding": 0.9, "torch": -0.8 },
  "swim": { "style": "hover" },
  "activities": { "inspect": { "weight": 0.6, "tags": { "shelter": 1, "rock": 0.4 } } }
}
```

- `body` è il pesce disegnato da Aquaria, sempre presente e leggero per la
  scheda grafica. `shape`: `disc`, `round`, `slender`, `tall` o `banner`.
  `pattern`: `belly`, `tail`, `bands`, `split`, `eye-bar`, `stripes`,
  `bars` o `idol`. Gamberetti e granchi usano `"category": "crustacean"`
  con forma `shrimp`, `crab` o `hermit-crab`.
- `model` (facoltativo) è una cartella con un modello 3D. Chi guarda può
  passare dal modello al corpo disegnato, specie per specie.
- `coloring` (facoltativo) è quali colorazioni del modello portano i
  pesci: un id, o più d'uno con i pesi, così un branco mescola i ceppi
  (vedi [MODELLI_PESCI.md](MODELLI_PESCI.md)).
- `length` è la lunghezza vera in metri. Ogni pesce ha la sua, attorno a
  `mean`.
- `speed` è in metri al secondo: l'andatura normale e quella massima.
- `schooling`: 0 nuota da solo, 1 sta in un branco stretto.
- `bands` e `heightRange` (0 = sabbia, 1 = superficie) sono dove vive.
- `maxCount` (facoltativo) limita quanti se ne possono mettere dal
  pannello.
- `behavior`, ognuno da 0 a 1: `appetite`, `curiosity` (quanti vengono a
  guardare il tuo dito), `shyness` (da quanto lontano un colpo sul vetro
  lo spaventa), `hiding` (quanti corrono a nascondersi quando hanno
  paura), `torch` (-1 fugge dalla torcia, 1 la adora) e `active` (`day`,
  `night` o `always`). Sono spiegati in
  [Giocare con i pesci](INTERAZIONE.md#chi-reagisce-e-quanto).
- `swim` e `activities` dicono come si muove e cosa fa durante il giorno.
  Hanno [una pagina loro](NUOTO.md).

### La dimensione dei pesci

Nel file restano le lunghezze vere. Quanto grandi si vedono lo decide chi
guarda: **Fish size**, nella sezione Fauna del pannello, avvicina tutte le
specie alla stessa misura. A 0% i pesci sono come in natura, quindi un
neon accanto a un pesce chirurgo è minuscolo; a 100% sono tutti grandi
uguali. Di partenza è 60%.

## Fare una texture nuova

Le texture di superficie sono file KTX2, che restano compressi nella
scheda grafica e occupano circa un quarto della memoria di un PNG. Uno
script le prepara da foto CC0:

```bash
python scripts/build_materials.py            # tutte
python scripts/build_materials.py reef-rock  # solo una
```

Serve Python 3 con Pillow e NumPy, e il programma `ktx` di KTX-Software
(installalo, oppure scompattalo nella cartella ignorata `tools/ktx/`). Per
aggiungerne una, metti la sua sorgente in `MATERIALS` nello script,
lancialo, e cita la fonte in `ASSETS.md`.
