# Modelli 3D dei pesci

_English version: [FISH_MODELS.md](FISH_MODELS.md)._

Ogni specie ha un corpo che Aquaria disegna da solo. Può avere anche un
modello 3D, e chi guarda sceglie quale vedere (il bollino **3D** sulla
scheda della specie nel pannello). Il modello si scarica solo quando viene
mostrato, e se non si carica resta il corpo disegnato.

Questa pagina spiega come aggiungere un modello trovato in giro, e come
farne uno in Blender.

## La cartella

```
public/assets/species/<id>/
  model.json   come Aquaria deve usare il modello
  model.glb    il modello, texture comprese
```

Va bene anche un `.gltf` con accanto il suo `.bin` e le texture. La specie
punta alla cartella con `"model": "<id>"` in `public/species.json`.

## model.json

Quello del platy, per esempio:

```json
{
  "name": "Platy",
  "file": "model.glb",
  "forward": "+x",
  "up": "+y",
  "swimAmplitude": 0.08,
  "mouth": { "morphTarget": "MouthOpen" },
  "eyes": { "bones": ["Eye.L", "Eye.R"], "turn": 22 },
  "gills": { "edge": 0.3, "top": 0.07, "bottom": -0.08, "curve": 4 },
  "credit": {
    "author": "Aquaria (scripts/blender/platy.py)",
    "source": "https://github.com/nispa/Aquaria/blob/main/scripts/blender/platy.py",
    "license": "CC0-1.0"
  }
}
```

- `forward` e `up`: quali assi del modello puntano verso il muso e verso
  il dorso. Aquaria ruota, centra e scala il modello alla lunghezza della
  specie, quindi va bene qualsiasi misura e orientamento.
- `swimAmplitude`: quanto si muove la coda, in lunghezze del corpo (di
  partenza 0.07). Il modello non ha bisogno di un'animazione di nuoto: lo
  piega Aquaria.
- `mouth`, `eyes`, `gills`, `fins`: facoltativi, vedi sotto. Senza, la bocca resta
  chiusa, gli occhi fermi e le branchie immobili.
- `credit`: chi l'ha fatto, da dove viene e la licenza. Sono accettate solo
  licenze che permettono riuso, modifiche e uso commerciale: `CC0-1.0`,
  `CC-BY-3.0`, `CC-BY-4.0`, `MIT`, `Apache-2.0`, `BSD-2-Clause`,
  `BSD-3-Clause`, `0BSD`, `Unlicense`. Il modello va elencato anche in
  `ASSETS.md`; un test lo controlla.

Il modello tiene i suoi materiali e le sue texture.

## Guardarlo: il pesce sul piano millimetrato

Avvia `pnpm dev` e apri `/model-viewer.html?id=<specie>` (o sceglilo da
`/debug.html`). Mostra il pesce dal lato destro, esattamente come lo
disegna l'acquario, sopra una griglia in lunghezze del corpo: la coda a
-0,5, il muso a +0,5, il dorso in alto.

I cursori di lato muovono occhi, bocca, branchie, la piega della virata,
la coda e il nuoto. Spunta **auto** e il cursore va avanti e indietro da
solo. La casella **3D** passa dal modello al corpo disegnato.

È qui che leggi le posizioni che chiedono `mouth.jaw`, `eyes.painted`,
`gills` e `fins.pectoral`. Due cursori muovono le pinne pettorali:
**Pectoral spread** le chiude (-1) e le apre (1), **Pectoral beats/s** le fa
battere. Con `&view=top` nell'indirizzo il pesce si vede dall'alto, e le
righe orizzontali della griglia leggono z: lì si misura quanto la pinna
sporge dal fianco.

## Un modello trovato in giro

I modelli scaricati sono spesso pesanti. Prima di aggiungerne uno,
comprimilo con [glTF Transform](https://gltf-transform.dev) (serve
KTX-Software nel `PATH`, vedi [Fare una texture nuova](SCRIVERE_SCENE.md#fare-una-texture-nuova)):

```bash
pnpm dlx @gltf-transform/cli@4.5.1 optimize sorgente.glb public/assets/species/<id>/model.glb --compress meshopt --texture-compress ktx2 --texture-size 1024
```

Punta a 5.000-20.000 triangoli. Le scansioni di esemplari veri di solito
pesano molto di più, e in acqua sembrano morte: spesso rendono male.

Un modello così di solito ha gli occhi dipinti e nessuna posa a bocca
aperta. Puoi comunque fargli guardare in giro, mangiare e respirare, con
posizioni lette sulla griglia:

```json
"mouth": { "jaw": { "start": 0.43, "line": -0.01, "drop": 0.02 } },
"eyes": { "painted": { "center": [0.37, 0.137], "radius": 0.024, "pupil": 0.72, "iris": "#d6dee6" } },
"gills": { "edge": 0.28, "top": 0.17, "bottom": -0.06, "curve": 3 }
```

- `mouth.jaw`: tutto quello che sta davanti a `start` e sotto `line` (dove
  si chiudono le labbra) si abbassa, fino a `drop` sulla punta del muso.
- `eyes.painted`: un occhio nuovo disegnato sopra quello dipinto, sui due
  lati. Fai `radius` abbastanza grande da coprire la vecchia pupilla.
  `pupil` è quanto è grande la pupilla rispetto all'occhio (di partenza
  0.65); si sposta con lo sguardo.
- `gills`: il bordo posteriore dell'opercolo (`edge`), quanto sale e
  scende (`top`, `bottom`), e quanto è curvo (`curve`, 0 è dritto). Si
  solleva di `open` (di partenza 0.006) circa una volta al secondo
  (`rate`), ogni pesce per conto suo.

### Le pinne pettorali

Le pettorali sono le pinne dietro le branchie. Un pesce pagliaccio fermo
sopra l'anemone le batte una dopo l'altra, tre o quattro volte al secondo;
quando nuota spinge con la coda e le pettorali remano insieme, più piano;
in uno scatto le chiude contro il corpo; per frenare le apre tutte e due,
e in virata apre quella all'interno della curva. Questo vale per tutti i
pesci: lo stesso shader muove le pinne di ogni modello e di ogni corpo
disegnato. A un modello basta dire dove sono, come il pesce pagliaccio:

```json
"fins": {
  "pectoral": {
    "root": [[0.14, 0.11], [0.155, -0.1]],
    "side": 0.1,
    "front": 0.17,
    "back": -0.08,
    "top": 0.14,
    "bottom": -0.13,
    "rest": 35,
    "sweep": 35
  }
}
```

- `front`, `back`, `top`, `bottom`: un riquadro sul fianco (x e y) che
  contiene tutta la pinna e nessun'altra.
- `side`: quanto lontano dal centro del corpo (z, dalla vista dall'alto)
  comincia la pinna. Nel riquadro si muove solo quello che sporge oltre:
  il fianco resta fermo. Mettilo appena fuori dalla pelle.
- `root`: l'estremità alta e quella bassa della base della pinna, la linea
  attorno a cui ruota.
- `rest`: di quanti gradi la pinna del modello si stacca dal corpo
  (di partenza 30); chiusa, ruota indietro di tanto e si appoggia al fianco.
- `sweep`: di quanti gradi oscilla in un battito pieno (di partenza 35).

Controlla sul visore con **Pectoral spread** a -1 (la pinna deve
appoggiarsi al corpo senza attraversarlo) e a 1. Il corpo disegnato ha le
sue pettorali, che si muovono allo stesso modo. Un modello fatto in Blender
le può avere come lastre separate dal corpo: il riquadro le trova lo
stesso.

Un pesce che allunga la bocca in avanti quando la apre, come l'orata o il
barramundi, con `jaw` viene male. Gli serve una vera posa a bocca aperta
fatta in Blender: `scripts/blender/seabream.py` la prende dall'animazione
della mandibola del modello stesso, `scripts/blender/barramundi.py` la
costruisce a mano.

## Fare un pesce in Blender

Guppy, platy, pesce angelo, royal gramma, sardina e gamberetto red cherry
sono fatti interamente da script in `scripts/blender/`, che condividono i
pezzi comuni in `fishkit.py`. Sono gli esempi migliori. Per lanciarne uno:

```bash
blender --background --python scripts/blender/platy.py
```

Se modelli a mano:

1. **Forma.** Muso verso il +X di Blender, dorso verso il +Z; allora
   `model.json` dice `"forward": "+x", "up": "+y"`. La misura non conta.
   Tieni la testa nella metà anteriore: Aquaria tiene rigido il primo
   quinto del corpo e piega il resto. Le pinne possono essere fogli
   singoli.
2. **Colori.** Materiali Principled BSDF, con texture o colori dei vertici
   in _Base Color_. Le pinne rendono meglio un po' trasparenti (alpha sotto
   1, modalità _Blended_).
3. **Bocca.** Una shape key con la bocca spalancata, per esempio
   `MouthOpen`, indicata con `"mouth": { "morphTarget": "MouthOpen" }`.
4. **Occhi.** Ogni bulbo oculare un pezzo a sé. Un'armatura con un osso
   radice e un osso per occhio (`Eye.L`, `Eye.R`), con la testa di ogni
   osso al centro del suo occhio. Dai a ogni occhio peso pieno sul suo
   osso, e il resto alla radice. Poi
   `"eyes": { "bones": ["Eye.L", "Eye.R"] }`. Gli occhi guardano da dove
   il pesce sta per girare.
5. **Esporta** in glTF Binary (`.glb`), con +Y Up, shape key e armatura
   accese, _Apply Modifiers_ spento e animazione spenta. Poi comprimilo:

   ```bash
   pnpm dlx @gltf-transform/cli@4.5.1 optimize model.glb public/assets/species/<id>/model.glb --compress meshopt --simplify false
   ```

   `--simplify false` lascia intatti ossa, shape key e colori.

6. **Controllalo** sulla griglia, poi in vasca: premi `A` e guarda un pesce
   girare. Gli occhi dovrebbero muoversi per primi. Se non si muovono,
   probabilmente i bulbi sono pesati sull'osso radice.

## Animali che camminano

Sui pesci Aquaria non riproduce animazioni: disegna un branco intero in un
colpo solo e piega lei i corpi. Gli animali che camminano sono diversi. Se
`model.json` indica un'animazione di camminata, ogni individuo è disegnato
come un modello animato a sé:

```json
"animations": { "walk": "Walk", "hide": "Hide", "speed": 0.4 }
```

- `walk`: l'animazione mentre cammina. Va al suo ritmo quando l'animale fa
  `speed` lunghezze del corpo al secondo, più veloce o più lenta con lui,
  e si ferma quando si ferma.
- `hide` (facoltativo): una posa in cui scivola quando ha paura, come un
  paguro che si ritira nel guscio.

Ognuno costa più di un pesce, quindi a queste specie dai un `maxCount`.
`scripts/blender/shrimp.py` fa scheletro e camminata del gamberetto da
zero; `scripts/blender/hermit_crab.py` dà a un paguro scaricato una
camminata migliore e la posa per nascondersi.
