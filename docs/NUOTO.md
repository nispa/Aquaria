# Stili di nuoto

_English version: [SWIMMING.md](SWIMMING.md)._

Ogni specie si muove a modo suo. Un pesce chirurgo fa lunghi giri, una
damigella scatta e plana, un pesce pagliaccio resta sopra il suo anemone,
un gamberetto cammina sul fondo. Questa pagina spiega come sceglierlo e
regolarlo, e cosa fanno i pesci durante la giornata.

![Percorsi di tre pesci per stile visti dall'alto, vetro in alto, e lo sforzo della coda di uno di loro in un minuto](swimming-styles.png)

<sub>Un minuto di ogni stile visto dall'alto, con il vetro in alto. Sotto
ogni vasca, quanto lavora la coda del pesce rosso. Rifatto da
`pnpm docs:gallery`.</sub>

## Scegliere uno stile

In `public/species.json`, dai alla specie una voce `swim`:

```json
"swim": { "style": "burst-coast", "burstSpeed": 2, "coastSeconds": [1, 3] }
```

Serve solo `style`. Tutti gli altri valori hanno un default, e i default
sono il risultato per cui lo stile è stato regolato: comincia senza. Una
specie senza `swim` usa `cruise`.

I valori sono relativi, così gli stessi numeri vanno bene per un pesce
piccolo e per uno grande:

- le velocità sono una parte della velocità di crociera della specie (1 =
  la sua andatura normale);
- le distanze sono in lunghezze del corpo;
- gli angoli sono in radianti (3,14 è un'inversione a U);
- i tempi sono in secondi; una coppia come `[1, 3]` vuol dire "tra 1 e 3,
  a caso ogni volta".

Un pesce non va mai più veloce del `speed.max` della sua specie.

## Gli stili

### `cruise`: giri lunghi e tranquilli

Pesci chirurgo, sardine, neon. La direzione vaga piano, l'andatura cambia
un poco, e ogni tanto il pesce si sposta a un'altra altezza.

| Valore                | Default | Cos'è                                                          |
| --------------------- | ------- | -------------------------------------------------------------- |
| `speedVariation`      | 0.15    | Quanto cambia l'andatura                                       |
| `turnJitter`          | 0.5     | Quanto è irrequieta la direzione                               |
| `heightChangeSeconds` | 12      | Ogni quanto cambia altezza                                     |
| `thrust`              | 1       | Quanto lavora la coda in crociera (sotto 1: spingono le pinne) |

### `burst-coast`: scatto e planata

Damigelle, guppy, platy, pesci chirurgo. Uno scatto breve in una nuova
direzione, poi una lunga planata con la coda quasi ferma, rallentando. Con
`thrust` basso (come nel blue tang), lo scatto è un impulso di pinne
pettorali: entrambe si aprono e battono insieme, poi si ripiegano lungo i
fianchi durante la planata. I pesci di un gruppo non scattano mai insieme.

| Valore                | Default    | Cos'è                                                                |
| --------------------- | ---------- | -------------------------------------------------------------------- |
| `burstSpeed`          | 2.2        | Andatura durante lo scatto                                           |
| `burstSeconds`        | 0.35       | Quanto dura uno scatto                                               |
| `coastSpeed`          | 0.35       | Andatura a cui rallenta                                              |
| `coastSeconds`        | [1.2, 3.5] | Quanto dura una planata                                              |
| `burstTurn`           | 0.9        | Quanto gira a ogni scatto                                            |
| `heightChangeSeconds` | 6          | Ogni quanto cambia altezza                                           |
| `thrust`              | 1          | Quanto lavora la coda nello scatto (basso: impulso con le pettorali) |

### `hover`: restare in un punto

Pesci pagliaccio, gramma, gourami. Il pesce resta vicino a un punto: si
lascia andare piano, ogni pochi secondi si gira sul posto e torna indietro
se si allontana. Se qualcosa lo porta via (il cibo, uno spavento), dopo
torna a casa.

Con `home`, il punto è invece una pianta o un oggetto: il più vicino con
quell'etichetta. Un pesce pagliaccio con `"home": "anemone"` resta sopra
l'anemone più vicino, anche se è più in basso di dove nuotano di solito i
pesci pagliaccio. Se nella scena non c'è un anemone, resta dove ha
cominciato.

| Valore                | Default  | Cos'è                                |
| --------------------- | -------- | ------------------------------------ |
| `speed`               | 0.2      | Andatura                             |
| `turnSeconds`         | [1.5, 5] | Tempo tra una girata e l'altra       |
| `turnAngle`           | 2.2      | La girata più ampia                  |
| `roamBodyLengths`     | 4        | Quanto si allontana prima di tornare |
| `heightChangeSeconds` | 10       | Ogni quanto cambia un po' altezza    |
| `home`                | nessuno  | Etichetta del posto sopra cui stare  |
| `dive`                | nessuno  | Ogni tanto si tuffa nella sua casa   |

Con `dive`, un pesce con una casa ci entra, come un pesce pagliaccio nel
suo anemone: resta tra i tentacoli per `inSeconds`, `depthBodyLengths`
(0.6) sotto la cima, girandosi piano per strofinarcisi, poi esce a
guardarsi intorno per `outSeconds`. Spaventato, si nasconde così a fondo.
Il pesce pagliaccio:

```json
"swim": {
  "style": "hover",
  "speed": 0.3,
  "roamBodyLengths": 1.5,
  "home": "anemone",
  "dive": { "inSeconds": [5, 12], "outSeconds": [3, 8] }
}
```

Sopra la sua casa, un pesce più grande dei suoi simili le sta più vicino:
il più grande della coppia resta accanto all'anemone, il più piccolo si
allontana di più.

### `glide`: otto lenti

Pesci angelo, idoli moreschi. Il pesce disegna un otto lento salendo e
scendendo in un'onda lunga. La coda lavora appena.

| Valore                | Default | Cos'è                                                  |
| --------------------- | ------- | ------------------------------------------------------ |
| `speed`               | 0.7     | Andatura                                               |
| `turnRate`            | 0.35    | Quanto in fretta gira in ogni anello                   |
| `heightSwing`         | 0.6     | Quanta parte della sua fascia di altezza copre un'onda |
| `heightPeriodSeconds` | 24      | Quanto dura una salita e discesa                       |

Pesci più lenti, o girate più rapide, fanno anelli più stretti.

### `patrol`: giri attorno a un punto

Pesci farfalla, il barramundi. Il pesce sceglie un punto e ci gira
attorno, cambiando verso ogni tanto.

| Valore              | Default  | Cos'è                                  |
| ------------------- | -------- | -------------------------------------- |
| `speed`             | 0.8      | Andatura                               |
| `radiusBodyLengths` | 6        | Grandezza del giro                     |
| `reverseSeconds`    | [15, 40] | Tempo tra un cambio di verso e l'altro |

### `crawl`: camminare sul fondo

Gamberetti, granchi, paguri. L'animale cammina sulla sabbia e sulla
roccia, si ferma a beccare il fondo, poi riparte da un'altra parte. La
corrente non lo sposta.

Un gamberetto nuota ancora quando ha un motivo: per scappare da un colpo
sul vetro, per raggiungere il cibo, per salire in cima a una pianta. Un
posto basso, come una conchiglia, lo becca restando a piedi.

| Valore        | Default  | Cos'è                                                     |
| ------------- | -------- | --------------------------------------------------------- |
| `speed`       | 0.5      | Andatura                                                  |
| `walkSeconds` | [2, 6]   | Quanto cammina tra una sosta e l'altra                    |
| `stopSeconds` | [1, 4]   | Quanto resta fermo                                        |
| `turnAngle`   | 1.2      | Quanto gira dopo una sosta                                |
| `turnJitter`  | 0.3      | Quanto vaga mentre cammina                                |
| `rideHeight`  | 0.12     | Quanto sta alto il corpo da terra, in lunghezze del corpo |
| `sideways`    | false    | Cammina di lato, come un granchio                         |
| `swims`       | true     | `false`: non si stacca mai da terra                       |
| `fright`      | `"flee"` | `"shell"`: si chiude nel guscio invece di scappare        |

Un granchio è `"sideways": true, "swims": false`: scappa, si nasconde e
mangia a piedi, e torna indietro senza girarsi. La stella marina rossa
striscia allo stesso modo, circa 10 cm al minuto con lunghe pause: il suo
corpo è la forma procedurale `starfish` (cinque braccia, le punte che si
piegano mentre va), elencata con le forme dei crostacei. Un paguro è
`"swims": false, "fright": "shell"`: quando ha paura si ritira nel guscio
dove si trova e resta fermo finché non si calma.

### Chi fa cosa

| Stile         | Specie                                                                        |
| ------------- | ----------------------------------------------------------------------------- |
| `cruise`      | blue tang, yellow tang, purple tang, sardina, neon, rasbora arlecchino, orata |
| `burst-coast` | damigella a tre bande, guppy, platy                                           |
| `hover`       | pesce pagliaccio, royal gramma, gourami nano                                  |
| `glide`       | idolo moresco, pesce angelo imperatore, pesce angelo d'acqua dolce            |
| `patrol`      | pesce farfalla, barramundi                                                    |
| `crawl`       | gamberetto red cherry, granchio d'acqua dolce, paguro, stella marina rossa    |

## Cosa fanno i pesci durante il giorno

Lo stile è _come_ nuota un pesce. In più, ogni pesce sta sempre facendo
qualcosa, la sua **attività**:

| Attività  | Cosa fa il pesce                                                             |
| --------- | ---------------------------------------------------------------------------- |
| `wander`  | Nuota in giro con il suo stile                                               |
| `inspect` | Va a guardare un posto per qualche secondo                                   |
| `peck`    | Scende su un posto e lo becca qualche volta, a bocca aperta                  |
| `rest`    | Nelle sue ore di riposo si sistema vicino a un riparo o al fondo e sta fermo |

Quando un'attività finisce, la prossima viene estratta a caso. Le
attività di una specie stanno in `activities`:

```json
"activities": {
  "wander": { "weight": 1, "seconds": [12, 30] },
  "peck": { "weight": 0.8, "tags": { "algae": 1, "plant": 0.6 } },
  "inspect": { "weight": 0.3, "tags": { "coral": 1, "starfish": 0.5 } }
}
```

- `weight` è quanto spesso viene scelta rispetto alle altre. Una specie
  senza `activities` nuota e basta.
- `tags` dice quali posti le interessano, da 0 a 1 (vedi sotto). Un pesce
  va solo nei posti delle sue fasce di profondità, ma a qualunque altezza:
  un pesce chirurgo che nuota in alto scende comunque a brucare le rocce.
- `wander.seconds`: quanto gira prima di scegliere di nuovo.
- `inspect.seconds` (`[4, 10]`) e `inspect.distanceBodyLengths` (2): per
  quanto guarda, e da quanto lontano.
- `peck.pecks` (`[3, 7]`): quante beccate prima di andarsene.
- `rest` (peso 1, etichette `{ "shelter": 1 }`, `seconds` `[40, 90]`):
  quanto e dove riposa.

Un colpo sul vetro, il cibo o il tuo dito sul vetro interrompono qualsiasi
attività.

**Giorno e notte.** Con **Realistic** acceso nel pannello, i pesci
rispettano gli orari della loro specie, scritti in `behavior.active`:
`day` (di partenza), `night` o `always`. Quando arriva la loro ora di
riposo scelgono `rest` sempre più spesso. Di notte la barriera si calma
mentre il barramundi si sveglia. Senza Realistic nessuno dorme.

Premi `A` per vedere l'attività di ogni pesce, con una linea verso il
posto a cui sta andando.

## Luoghi ed etichette

I pesci non cercano "l'anemone" o "quella roccia": cercano **etichette**.
Ogni pianta e oggetto ne ha qualcuna: un anemone è `anemone` e `shelter`,
una roccia è `rock` e `algae`, un corallo a tavola è `coral` e `shelter`.
Sono scritte nella cartella dell'oggetto (vedi
[Piante e oggetti](OGGETTI.md#tags-cosè-per-un-pesce)), e una voce della
scena può cambiarle:

```json
{ "kind": "rock", "count": 3, "color": "#7d7468", "tags": ["rock", "shelter"] }
```

Adesso quelle tre rocce sono un nascondiglio. Cambiare le etichette basta
a dare a una specie una casa nuova o un nuovo cibo preferito.

## Pesci e ostacoli

I pesci girano attorno a rocce, coralli e legni, e si evitano tra loro.

- Ogni oggetto ha una forma di collisione approssimata. Un pesce guarda un
  po' avanti e scarta quello che ha davanti senza rallentare. Con `A`
  acceso, `C` disegna queste forme.
- Le piante sono morbide: i pesci passano tra le alghe e si infilano negli
  anemoni.
- Un pesce che va verso un posto (per beccare, riposare o nascondersi) ci
  arriva fino in fondo.
- Un pesce incastrato in un angolo della roccia per un paio di secondi
  cerca la via più libera per uscire.
- I pesci grandi spostano quelli piccoli, non il contrario.

## Per chi sviluppa

### Cosa fa uno stile

Uno stile non muove mai un pesce. A ogni passo dice solo cosa vorrebbe il
pesce: una direzione, un'altezza, un'andatura, quanto in fretta
raggiungerla e quanto deve lavorare la coda (`SwimState`, in
`src/sim/behaviors/types.ts`). La simulazione (`src/sim/simulation.ts`)
mescola questo con tutto il resto:

1. lo stile aggiorna i suoi desideri;
2. una spinta gira il pesce verso la direzione voluta, e una spinta
   leggera lo porta verso l'altezza voluta;
3. si sommano le altre spinte: vicini, branco, bordi della sua parte di
   vasca, sabbia e roccia, ostacoli;
4. l'andatura va verso quella voluta, a meno che una reazione (paura,
   cibo, curiosità) non la decida al suo posto;
5. lo sforzo della coda segue velocità e accelerazione, moltiplicato per
   il `thrust` dello stile, così una planata sembra davvero una planata;
6. le pinne pettorali seguono la stessa spinta (`src/sim/pectoralFins.ts`):
   un pesce con poco `thrust` (`hover`) sta fermo battendole una dopo
   l'altra; uno che nuota le fa remare piano; uno scatto le chiude, e
   frenare o girare le apre (vedi [MODELLI_PESCI.md](MODELLI_PESCI.md#le-pinne-pettorali)).

Le attività funzionano allo stesso modo: a ogni passo possono
sovrascrivere i desideri dello stile. Possono anche aprire la bocca e
tuffarsi a picco, cosa che uno stile non fa mai.

Chi cammina (`crawl`) è l'eccezione: la simulazione lo tiene a terra a
`rideHeight` e il corpo si gira per conto suo (`Fish.facing`), così un
granchio può camminare di lato.

Tutto il caso viene dal generatore con seed, quindi lo stesso seed dà gli
stessi pesci che fanno le stesse cose. Test e screenshot si basano su
questo.

### Aggiungere uno stile

1. Dichiara i suoi valori in `src/scene/swimming.ts`, ognuno con un
   default, e aggiungilo a `swimSchema`.
2. Scrivilo in un file suo in `src/sim/behaviors/`, con `start` (prepara un
   pesce) e `step` (aggiorna i desideri; gira per ogni pesce a ogni
   fotogramma, quindi niente allocazioni).
3. Registralo in `SWIM_STYLES` in `src/sim/behaviors/index.ts`. TypeScript
   protesta se te lo dimentichi.
4. Testalo accanto al suo file. `harness.ts` fa girare uno stile da solo,
   in una stanza fissa con un generatore con seed.
5. Aggiungilo a questa pagina.

Le attività stanno nella stessa cartella e si aggiungono allo stesso modo
(`ACTIVITIES`, valori in `src/scene/activities.ts`).
