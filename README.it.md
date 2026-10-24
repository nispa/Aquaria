# Aquaria

<p align="center"><a href="README.md">English</a> · <b>Italiano</b></p>

[![Aquaria, un acquario 3D in tempo reale nel browser](docs/hero.jpg)](https://nispa.github.io/Aquaria/)

<h3 align="center">▶ <a href="https://nispa.github.io/Aquaria/">Provalo nel browser</a></h3>

<p align="center">Niente da installare: funziona in qualsiasi browser recente, anche sul telefono.</p>

Aquaria è un acquario 3D che gira nel browser. È nato per gli schermi
grandi, da un monitor Full HD a una parete LED 4K, ma va bene anche su un
portatile.

Ogni vasca è un file JSON: le misure, l'acqua, la luce, le piante, le rocce
e i pesci. Puoi cambiarla a mano o con l'editor incluso. I pesci non
seguono binari: ognuno decide dove andare, nuota come la sua specie,
mangia, si nasconde, di notte riposa e reagisce a te.

Sul telefono Aquaria apre una piccola barriera tutta sua, leggera quanto
basta perché il telefono la disegni fluida.

![La vasca da esposizione Aquaria con il look Hero](docs/screenshot-realistic.jpg)

<sub>Aquaria, la vasca da esposizione: pesci di mare e d'acqua dolce insieme, con il look Hero.</sub>

![Un acquario di barriera con la sovrimpressione di A e le forme di C](docs/screenshot.jpg)

<sub>Premi `A` per vedere cosa sta facendo ogni pesce, e `C` per le forme che i pesci aggirano.</sub>

<p align="center">
  <img src="docs/nano-phone.jpg" alt="Il Nano reef su un telefono" width="300" />
  <br>
  <sub>Sul telefono: il Nano reef, un anemone e una coppia di pesci pagliaccio.</sub>
</p>

| [![Hero](docs/scenes/hero.jpg)](docs/scenes/hero.jpg) | [![Aquaria](docs/scenes/aquaria.jpg)](docs/scenes/aquaria.jpg) | [![Nano reef](docs/scenes/nano-reef.jpg)](docs/scenes/nano-reef.jpg) | [![Tropical reef](docs/scenes/reef.jpg)](docs/scenes/reef.jpg) | [![Home reef](docs/scenes/home-reef.jpg)](docs/scenes/home-reef.jpg) | [![Planted tank](docs/scenes/planted-tank.jpg)](docs/scenes/planted-tank.jpg) | [![Iwagumi](docs/scenes/iwagumi.jpg)](docs/scenes/iwagumi.jpg) |
| :---------------------------------------------------: | :------------------------------------------------------------: | :------------------------------------------------------------------: | :------------------------------------------------------------: | :------------------------------------------------------------------: | :---------------------------------------------------------------------------: | :------------------------------------------------------------: |
|                         Hero                          |                            Aquaria                             |                              Nano reef                               |                         Tropical reef                          |                              Home reef                               |                                 Planted tank                                  |                            Iwagumi                             |

## Cose da provare

- Premi `Spazio` per far cadere del cibo e guarda i pesci che salgono a
  prenderlo.
- Clicca sul vetro: i pesci vicini scappano, alcuni vanno a nascondersi.
- Lascia il mouse fermo sulla vasca: i curiosi vengono a guardarti.
- Disegna cerchi veloci vicino a un pesce per ipnotizzarlo. Scarabocchiaci
  sopra per fargli il solletico.
- Premi `T` per la torcia, `Z` per la lente d'ingrandimento, `A` per vedere
  cosa fa ogni pesce, `H` per il pannello di controllo.

Tutto quello che puoi fare con i pesci è in
[Giocare con i pesci](docs/INTERAZIONE.md).

## Avviarlo

Servono Node.js 22 e pnpm.

```bash
pnpm install
pnpm dev          # poi apri l'indirizzo che stampa
```

La versione online viene pubblicata da `main` su
<https://nispa.github.io/Aquaria/>. Si può installare come app (il pulsante
_Installa_ del browser) e poi funziona anche senza rete.

### Tasti

| Tasto                | Cosa fa                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `H`                  | Pannello di controllo                                            |
| `F`                  | Schermo intero                                                   |
| `Spazio`             | Un pizzico di cibo, sopra il mouse                               |
| `A`                  | Cosa sta facendo ogni pesce                                      |
| `C` (con `A` acceso) | Le forme che i pesci evitano                                     |
| `T`                  | Torcia                                                           |
| `Z`                  | Lente d'ingrandimento                                            |
| `M`                  | Suono acceso o spento                                            |
| `P`                  | Su uno schermo touch, un tocco punta invece di battere sul vetro |
| `E`                  | Editor delle scene                                               |

Quando muovi il mouse o tocchi lo schermo compaiono nell'angolo alcuni
pulsanti tondi (punta, torcia, lente, cibo, pannello), che poi spariscono.

### Opzioni nell'indirizzo

| Opzione   | Esempio                  | Cosa fa                                             |
| --------- | ------------------------ | --------------------------------------------------- |
| `scene`   | `?scene=home-reef`       | Apre quella scena                                   |
| `hour`    | `?hour=21.5`             | Fissa l'ora del giorno                              |
| `seed`    | `?seed=7`                | Un'altra disposizione casuale della stessa scena    |
| `effects` | `?effects=shadows,bloom` | Solo questi effetti (`none` li spegne tutti)        |
| `frozen`  | `?frozen=10`             | Fa passare 10 secondi, poi mostra un'immagine ferma |
| `debug`   | `?debug=overlay,shapes`  | Parte con `A` (e `C`) acceso                        |

Quello che cambi nel pannello viene ricordato dal browser.

## Le scene

Con Aquaria arrivano sette scene. Sono esempi: aprine una nell'editor
(`E`), cambiala e salvala come tua. Dal pannello (`H`) cambi scena e look.

| Scena                         | Cos'è                                                          | Vasca (l × a × p) |
| ----------------------------- | -------------------------------------------------------------- | ----------------- |
| Hero (`hero`, iniziale)       | Mare aperto: pinnacoli di roccia, coralli, kelp e banchi       | 6 × 3,2 × 3,2 m   |
| Aquaria (`aquaria`)           | Una vasca da esposizione, mare e acqua dolce per gioco         | 6 × 3,2 × 3,2 m   |
| Nano reef (`nano-reef`)       | Una piccola barriera con un anemone; i telefoni aprono questa  | 1 × 0,75 × 0,7 m  |
| Tropical reef (`reef`)        | Mare aperto, una barriera corallina                            | 5,4 × 3 × 4 m     |
| Home reef (`home-reef`)       | Un acquario di barriera marino                                 | 6 × 2,6 × 2,4 m   |
| Planted tank (`planted-tank`) | Un acquario d'acqua dolce con piante, gamberetti e un granchio | 2,4 × 1,1 × 1 m   |
| Iwagumi (`iwagumi`)           | Un paesaggio d'acqua dolce di pietre e piante tappezzanti      | 2,2 × 1,1 × 1 m   |

## Su una parete

Compilalo una volta, servilo e aprilo in Chrome in modalità kiosk:

```bash
pnpm build
pnpm preview --host
chrome --kiosk --autoplay-policy=no-user-gesture-required http://localhost:4173
```

Su quel computer spegni la sospensione e il salvaschermo. Parti dal 4K,
poi prova il Full HD da dove starà la gente: se non vedi la differenza,
tieni il più basso. La scheda grafica ringrazia.

### Usare la scheda grafica dedicata

Su un PC con due schede grafiche, Windows fa spesso girare il browser su
quella integrata, la più debole, e il 4K va a scatti. Il pannello mostra
quale scheda è in uso sotto **Quality**, con un avviso quando è quella
integrata.

Per spostare Chrome o Edge sulla scheda dedicata:

1. Impostazioni di Windows → Sistema → Schermo → **Grafica**. Aggiungi il
   browser se non è in elenco (Edge è
   `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`, Chrome
   `C:\Program Files\Google\Chrome\Application\chrome.exe`), poi
   _Opzioni_ → **Prestazioni elevate**. Questa impostazione vince sui
   pannelli di NVIDIA e AMD, che i browser spesso ignorano.
2. Controlla che l'accelerazione hardware sia accesa:
   `edge://settings/system` o `chrome://settings/system`.
3. Chiudi il browser davvero. Edge resta acceso in background: in
   `edge://settings/system` spegni _Avvio rapido_ e _Continua a eseguire
   estensioni e app in background_, chiudi tutte le finestre e controlla
   in Gestione attività che non resti nessun `msedge.exe` (oppure lancia
   `taskkill /IM msedge.exe /F`).
4. Apri `edge://gpu` (o `chrome://gpu`): _GL_RENDERER_ deve nominare la tua
   scheda NVIDIA o AMD.

Su un portatile tienilo attaccato alla corrente: a batteria Windows può
scegliere ancora la scheda integrata.

## Fare il tuo

- [Guida all'uso](docs/GUIDA_UTENTE.md): il pannello, luci e ciclo del
  giorno, effetti, l'editor delle scene.
- [Scrivere scene e specie](docs/SCRIVERE_SCENE.md): i file JSON, campo
  per campo.
- [Stili di nuoto](docs/NUOTO.md): come si muove ogni specie, e cosa fanno
  i pesci durante il giorno.
- [Giocare con i pesci](docs/INTERAZIONE.md): cosa fanno loro mouse e
  tasti.
- [Modelli 3D dei pesci](docs/MODELLI_PESCI.md): aggiungere un modello, o
  farne e dipingerne uno in Blender, con più ceppi dello stesso pesce.
- [Piante e oggetti](docs/OGGETTI.md): una pianta o un oggetto nuovo è una
  cartella di file.
- [Effetti fatti di file](docs/EFFETTI.md): un nuovo effetto di
  post-processing è un piccolo shader.
- [Come è fatto Aquaria](docs/ARCHITETTURA.md): le scelte principali e il
  perché.

## Debug

Con `pnpm dev` acceso, apri **`/debug.html`**. Da lì puoi:

- aprire l'acquario con qualsiasi scena, seed, ora ed effetti, con la
  sovrimpressione delle attività e le forme di collisione già accese;
- aprire **il pesce sul piano millimetrato** (`/model-viewer.html`): una
  specie vista di lato, sopra una griglia in lunghezze del corpo, con
  cursori per occhi, bocca, branchie, virata, coda e nuoto. Spunta _auto_
  accanto a un cursore e si muove avanti e indietro da solo.

## Sviluppo

```bash
pnpm test           # test unitari
pnpm test:coverage  # test unitari con copertura
pnpm test:e2e       # test nel browser
pnpm test:visual    # confronta un'immagine di ogni scena (da lanciare a mano)
pnpm docs:gallery   # rifà le immagini usate nella documentazione
pnpm export:objects # salva in .glb piante, oggetti generati e roccia a blocchi
pnpm lint
pnpm typecheck
pnpm build
```

Le regole per contribuire (prima i test, livelli del codice, prestazioni)
sono in [AGENTS.md](AGENTS.md), in inglese.

## Licenza

Codice: [MIT](LICENSE). Modelli, texture e altri materiali fatti da altri
sono elencati con le loro licenze in [ASSETS.md](ASSETS.md).
