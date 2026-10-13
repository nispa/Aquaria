# Aquaria — Guida all'Uso e ai Meccanismi Architetturali

Questa guida completa illustra come utilizzare, configurare ed estendere **Aquaria**, oltre a spiegare in dettaglio i meccanismi tecnici e le scelte architetturali adottate: _"Ho fatto questo per questo motivo"_, giustificando la semplicità del sistema e l'assenza di motori pesanti come Unity o Unreal Engine.

---

## Indice

1. [Parte 1: Guida Operativa all'Uso](#parte-1-guida-operativa-alluso)
   - [Requisiti e Avvio Rapido](#requisiti-e-avvio-rapido)
   - [Scorciatoie da Tastiera e Controlli](#scorciatoie-da-tastiera-e-controlli)
   - [Il Pannello di Controllo (`H`)](#il-pannello-di-controllo-h)
   - [Illuminazione Spettrale e Ciclo Giorno/Notte](#illuminazione-spettrale-e-ciclo-giornonotte)
   - [Qualità Grafica, Risoluzione ed Effetti Post-Processing](#qualità-grafica-risoluzione-ed-effetti-post-processing)
   - [Lo Scene Designer (Editor Visuale Integrato)](#lo-scene-designer-editor-visuale-integrato)
   - [Parametri URL per Automazione e Schermi Pubblici](#parametri-url-per-automazione-e-schermi-pubblici)
   - [Installazione su Pareti LED e Schermi 4K (Modalità Kiosk)](#installazione-su-pareti-led-e-schermi-4k-modalità-kiosk)
2. [Parte 2: Guida all'Apprendimento — "Ho fatto questo per questo motivo"](#parte-2-guida-allapprendimento--ho-fatto-questo-per-questo-motivo)
   - [Perché il Web (TypeScript + Three.js) e non Unity o Unreal Engine?](#perché-il-web-typescript--threejs-e-non-unity-o-unreal-engine)
   - [Architettura a Livelli Rigidi (Clean Architecture Unidirezionale)](#architettura-a-livelli-rigidi-clean-architecture-unidirezionale)
   - [TDD Puro e Test senza Browser/GPU (Vitest & Node.js)](#tdd-puro-e-test-senza-browsergpu-vitest--nodejs)
   - [Zero Allocazioni per Frame (Il Problema del Garbage Collector)](#zero-allocazioni-per-frame-il-problema-del-garbage-collector)
   - [Comportamento Biologico (Boids con Fasce di Profondità) vs Fisica Rigida](#comportamento-biologico-boids-con-fasce-di-profondità-vs-fisica-rigida)
   - [Illuminazione Fotobiologica a 4 Canali e Fluorescenza dei Coralli](#illuminazione-fotobiologica-a-4-canali-e-fluorescenza-dei-coralli)
   - [Formato Dati Dichiarativo e Validazione Stretta con Zod](#formato-dati-dichiarativo-e-validazione-stretta-con-zod)
   - [Texture Compresse KTX2 per la Memoria VRAM a 4K](#texture-compresse-ktx2-per-la-memoria-vram-a-4k)
   - [Pipeline di Post-Processing Modulare](#pipeline-di-post-processing-modulare)

---

# Parte 1: Guida Operativa all'Uso

### Requisiti e Avvio Rapido

- **Prerequisiti**: Node.js (versione 22 o superiore) e il gestore pacchetti `pnpm`.
- **Installazione ed esecuzione in locale**:
  ```bash
  pnpm install
  pnpm dev
  ```
  Apri nel browser l'indirizzo mostrato a terminale (normalmente `http://localhost:5173`).

---

### Scorciatoie da Tastiera e Controlli

| Tasto / Gesto                   | Azione                 | Descrizione                                                                                                                              |
| :------------------------------ | :--------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| **`H`**                         | Apri / Chiudi Pannello | Mostra o nasconde la barra laterale di controllo.                                                                                        |
| **`F`**                         | Schermo Intero         | Attiva o disattiva la modalità fullscreen (senza barre del browser).                                                                     |
| **`Spazio`**                    | Dai da mangiare        | Lascia cadere un pizzico di fiocchi, sopra il puntatore se è sulla vasca (anche col pulsante _Feed the fish_ del pannello).              |
| **Puntatore fermo sulla vasca** | Dito sul vetro         | Gli individui curiosi di ogni specie vengono a guardare; dopo 8 s senza movimento il dito conta come tolto.                              |
| **Click sulla vasca**           | Colpo sul vetro        | I pesci vicini scappano di scatto; le specie timide fuggono da più lontano. Si calmano in pochi secondi.                                 |
| **Movimento Mouse**             | Mostra Icona Menu      | Muovendo il cursore appare un pulsante d'angolo temporaneo che svanisce dopo 2,5 secondi per prevenire il burn-in dei pixel sui display. |

---

### Il Pannello di Controllo (`H`)

Il pannello, gestito da [`createPanel`](file:///F:/progetti/Aquaria/src/ui/panel.ts#L102), offre il pieno controllo in tempo reale:

1. **Selezione Scena**:
   - Permette di selezionare le ambientazioni predefinite (es. _Tropical reef_, _Home reef_, _Planted tank_, _Iwagumi_) o quelle salvate dall'utente (_My scenes_).
   - Contiene il pulsante **Scene Designer** per aprire l'editor visuale.

2. **Popolazione della Fauna**:
   - Ciascuna specie di pesce definita nel catalogo [`public/species.json`](file:///F:/progetti/Aquaria/public/species.json) ha un cursore da 0 a 50 individui.
   - Quando si riduce o aumenta il numero, **i pesci non spariscono né compaiono nel nulla**: nuotano verso l'esterno o entrano gradualmente dai lati della vasca.

3. **Elementi di Arredo (Scenery)**:
   - Cursori per aumentare o diminuire la quantità di piante acquatiche, gorgonie, anemoni, rocce e coralli. L'aggiunta di elementi preserva la posizione di quelli già esistenti.

#### Le scene incluse

Le quattro scene incluse sono esempi di ciò che si può costruire: ognuna è modificabile con lo Scene Designer o direttamente nel suo file JSON.

| Scena         | Tipo di acquario                                            |
| ------------- | ----------------------------------------------------------- |
| Tropical reef | Mare aperto, barriera corallina tropicale (acqua salata)    |
| Home reef     | Acquario marino di barriera (acqua salata)                  |
| Planted tank  | Acquario di comunità piantumato (acqua dolce)               |
| Iwagumi       | Aquascape Iwagumi, rocce e piante tappezzanti (acqua dolce) |

![Tropical reef](scenes/reef.jpg)
![Home reef](scenes/home-reef.jpg)
![Planted tank](scenes/planted-tank.jpg)
![Iwagumi](scenes/iwagumi.jpg)

---

### Illuminazione Spettrale e Ciclo Giorno/Notte

Aquaria riproduce fedelmente l'illuminazione professionale per acquari marini e barriere coralline su 4 canali:

- **White (Bianco)**: Luce solare a spettro pieno.
- **Actinic Blue (450 nm)**: Luce blu attinica ad alta penetrazione che stimola i pigmenti biologici.
- **Violet / UV (420 nm)**: Radiazione a lunghezza d'onda corta che accende la fluorescenza naturale di coralli e anemoni.
- **Accent e Luna**: Tinta personalizzata e soffusa luce lunare notturna.

**Modalità del Ciclo Solare**:

- **Fixed Hour**: Fissa l'ora dell'acquario (da 0.0 a 24.0) per esposizioni o fotografie.
- **Real Clock**: Sincronizza l'illuminazione con l'ora reale del computer.
- **Accelerated Day**: Comprime un ciclo completo di 24 ore in pochi minuti configurabili (es. 10 minuti).

---

### Qualità Grafica, Risoluzione ed Effetti Post-Processing

Nel menu _Quality_, integrato con la lista modulare [`EFFECTS`](file:///F:/progetti/Aquaria/src/render/effects/index.ts#L14):

- **Slider di Risoluzione**: Permette di impostare la risoluzione interna di rendering da 540p fino a 4K effettivo (2160p), svincolata dal fattore di scala del sistema operativo.
- **Anti-Aliasing**: Supporto per MSAA nativo (Disattivo, 2x, 4x, 8x) e filtro aggiuntivo SMAA per rifinire dettagli sottilissimi come pinne e fili d'erba.
- **Interruttori Effetti**:
  - _Caustics_: Rete dinamica di onde di luce rifratte sul fondo, rocce e pesci.
  - _Shadows_: Ombre proiettate della luce solare da pesci, kelp e formazioni rocciose.
  - _Volumetric Light_: Raggi crepuscolari (God rays) attraverso la colonna d'acqua occlusi da flora e fauna.
  - _Ambient Occlusion (SSAO)_: Occlusione ambientale negli anfratti e alla base delle rocce (pesante sulla GPU).
  - _Depth of Field_: Profondità di campo ottica con sfocatura progressiva.
  - _Bloom e Dither_: Bagliore morbido sui riflessi e dithering per eliminare il banding sui gradienti scuri tipici dei pannelli LED.
- **Monitor GPU ed FPS**: Segnala il framerate istantaneo e avvisa l'utente se il browser sta erroneamente usando la GPU integrata a basso consumo.

---

### Lo Scene Designer (Editor Visuale Integrato)

Accessibile cliccando su **Scene Designer** nel pannello ([`createDesigner`](file:///F:/progetti/Aquaria/src/ui/designer.ts#L327)):

1. **Dimensioni Vasca (Tank)**: Regola larghezza, altezza e profondità (in metri).
2. **Proprietà dell'Acqua**: Colore, densità della nebbia subacquea (_fogDensity_), increspatura della superficie e bolle d'aria.
3. **Corrente Acquatica**: Vettore di direzione e turbolenza che flettono gli steli delle piante e trasportano la "neve marina".
4. **Fondale e Barriera Rocciosa (Rockwork)**: Scelta del materiale fotorealistico del fondale ([`public/assets/materials/`](file:///F:/progetti/Aquaria/public/assets/materials/)) e generazione opzionale di un reef roccioso ondulato.
5. **Composizione Flora & Props**: Inserisci specie floreali o rocce/coralli, impostando fasce di profondità (bande da 0 a 4), altezza, palette colori e supporto di crescita (sabbia o barriera rocciosa).
6. **Anteprima e Salvataggio**:
   - _Auto preview_: Ricarica la scena a video 500 ms dopo ogni regolazione.
   - _Save as my scene_: Salva la scena nel LocalStorage del browser.
   - _Export / Import JSON_: Scarica il file `.json` generato da inserire in [`public/scenes/`](file:///F:/progetti/Aquaria/public/scenes/) o ricarica file salvati in precedenza.

---

### Parametri URL per Automazione e Schermi Pubblici

Puoi avviare l'acquario preconfigurato inserendo parametri nella barra degli indirizzi:

| Parametro | Esempio                     | Funzione                                                                                  |
| :-------- | :-------------------------- | :---------------------------------------------------------------------------------------- |
| `scene`   | `?scene=planted-tank`       | Carica direttamente la scena specificata da `public/scenes/<id>.json`.                    |
| `seed`    | `?seed=9876`                | Fissa il seed casuale per ottenere una disposizione geometrica identica.                  |
| `hour`    | `?hour=20.5`                | Imposta l'orario fisso (es. 20:30 per illuminazione crepuscolare blu).                    |
| `effects` | `?effects=caustics,shadows` | Attiva selettivamente solo gli effetti indicati (`?effects=none` per disattivarli tutti). |
| `frozen`  | `?frozen=10`                | Esegue 10 secondi di simulazione e blocca la scena su un fotogramma statico.              |

---

### Installazione su Pareti LED e Schermi 4K (Modalità Kiosk)

Per installazioni museali, fiere o grandi pareti LED:

1. **Compilazione ed esecuzione statica**:
   ```bash
   pnpm build
   pnpm preview --host
   ```
2. **Avvio in modalità Kiosk (senza barre né cornici)**:
   ```bash
   chrome --kiosk --autoplay-policy=no-user-gesture-required http://localhost:4173
   ```
3. **Forzare la GPU Dedicata (Windows)**:
   - Apri _Impostazioni di Windows → Sistema → Schermo → Grafica_.
   - Aggiungi il file eseguibile di Chrome o Edge e imposta **Prestazioni elevate** (High Performance).
   - In `chrome://settings/system`, verifica che l'opzione _Usa accelerazione grafica se disponibile_ sia attiva.

---

# Parte 2: Guida all'Apprendimento — "Ho fatto questo per questo motivo"

### Perché il Web (TypeScript + Three.js) e non Unity o Unreal Engine?

Quando si deve realizzare un'applicazione grafica 3D fotorealistica per grandi display, la prima tentazione è usare Unity o Unreal Engine. **Aquaria sceglie intenzionalmente di non usarli, e il motivo è profondo**:

1. **Deployment a Ingombro Zero e Affidabilità Kiosk**:
   - _Il Motivo_: Una build standalone di Unreal o Unity pesa da 2 a 15 Gigabyte, richiede runtime C++, DirectX/Vulkan complessi, driver grafici specifici, e installer con privilegi di amministratore. Aggiornare un totem pubblico o una parete LED con un eseguibile monolitico è rischioso e pesante.
   - _Cosa è stato fatto_: Aquaria genera un pacchetto statico leggero (HTML/JS/KTX2) servibile via web. Qualsiasi computer (anche un Mini PC o NUC) può avviarlo a schermo intero tramite una finestra browser Chrome/Edge in modalità Kiosk, senza bisogno di alcuna installazione software e con aggiornamenti istantanei via rete.

2. **Nessun "Engine Bloat" e Nessun Garbage Collector Imprevedibile**:
   - _Il Motivo_: I grandi motori generici portano con sé milioni di righe di codice che non servono per un acquario (motori di fisica complessi come PhysX/Chaos, audio engine, gestione collisioni complesse, moduli multiplayer). In Unity, il Garbage Collector del runtime C# (.NET) tende ad attivarsi periodicamente a sorpresa, generando micro-blocchi ("stuttering") inaccettabili su display a 60 FPS continui.
   - _Cosa è stato fatto_: Aquaria contiene **solo ed esclusivamente** ciò che serve per il moto dei banchi di pesci, la fluidodinamica ottica e gli shader subacquei.

3. **Velocità di Sviluppo ed Esecuzione Immediata**:
   - Con Vite e TypeScript, modificare uno shader o una formula di nuoto aggiorna il visualizzatore in pochi millisecondi. Non si attendono lunghi tempi di compilazione C++ o bake di scene.

4. **Dati Aperti e Ispezionabili (JSON Umano)**:
   - Le scene non sono blob binari proprietari (`.unity`, `.umap`), ma file JSON trasparenti versionabili con Git e modificabili con qualsiasi editor o con lo Scene Designer integrato.

---

### Architettura a Livelli Rigidi (Clean Architecture Unidirezionale)

Il codice sorgente è organizzato in strati con dipendenze rigorosamente discendenti:

```
src/core     → Utilità pure: RNG con seed, clock fisso, matematica, event bus.
src/scene    → Descrittori JSON, catalogo specie, schemi Zod, validazione.
src/sim      → Simulazione boids, steering, habitat, corrente marina.
src/render   → Adattatori Three.js, geometrie procedurali, materiali, shader GLSL.
src/ui       → Pannello di controllo, Scene Designer, controlli DOM.
src/app      → Composition root che istanzia i moduli e guida il loop principale.
```

- **Ho fatto questo per questo motivo**:
  - Se il codice di movimento dei pesci in `src/sim/` importasse una `Mesh` di Three.js o elementi del DOM, non sarebbe possibile testarlo in modo rapido e isolato senza un browser o una GPU.
  - Impedendo l'importazione di Three.js e del DOM in `core`, `scene` e `sim` (regola formalmente garantita dal linter in [`eslint.config.mjs`](file:///F:/progetti/Aquaria/eslint.config.mjs)), la logica vive come codice matematico puro e indipendente dal motore di rendering. Se domani Three.js venisse sostituito da un renderer WebGPU nativo, il 100% della simulazione e dei dati rimarrebbe intatto.

---

### TDD Puro e Test senza Browser/GPU (Vitest & Node.js)

- **Il Motivo**: Le applicazioni 3D soffrono spesso della "sindrome da test manuale": gli sviluppatori passano ore ad avviare la grafica per verificare se una regola numerica funziona.
- **Cosa è stato fatto**:
  - Ogni regola (allontanamento dal fondale, fasce di profondità, calcolo della corrente, curve di transizione giorno/notte) è scritta con la metodologia TDD (Red-Green-Refactor).
  - Usando un generatore casuale deterministico con seed ([`src/core/rng.ts`](file:///F:/progetti/Aquaria/src/core/rng.ts)) e un clock iniettabile ([`src/core/clock.ts`](file:///F:/progetti/Aquaria/src/core/clock.ts)), i test non soffrono di instabilità dovute a `Math.random()` o `Date.now()`.
  - Tutti i **382 test unitari** vengono eseguiti in ambiente Node in appena **~600 ms**, garantendo affidabilità immediata ad ogni modifica.

---

### Zero Allocazioni per Frame (Il Problema del Garbage Collector)

- **Il Motivo**: In JavaScript, se si crea un nuovo vettore `new Vector3()` o un nuovo array ad ogni fotogramma per ciascuno dei 300 pesci, la memoria Heap del browser si satura rapidamente. Quando il Garbage Collector (GC) interviene per liberarla, il rendering si arresta per 10-30 ms, causando vistosi scatti visivi ("hiccups").
- **Cosa è stato fatto**:
  - Nel ciclo principale di [`src/sim/simulation.ts`](file:///F:/progetti/Aquaria/src/sim/simulation.ts) e [`src/sim/steering.ts`](file:///F:/progetti/Aquaria/src/sim/steering.ts) **non viene mai istanziato alcun oggetto o array a runtime**.
  - Si riutilizzano vettori di appoggio ("scratch variables") preallocati e si modificano i dati sul posto (_in-place_). Il Garbage Collector rimane completamente inerte anche durante settimane di funzionamento continuo su un maxischermo.

---

### Comportamento Biologico (Boids con Fasce di Profondità) vs Fisica Rigida

- **Il Motivo**: Nei motori generici i corpi sono solidi rigidi soggetti a gravità e collisioni cinematiche. I pesci reali, al contrario, non rimbalzano: percepiscono i compagni e i confini e deviano dolcemente la propria rotta.
- **Cosa è stato fatto**:
  - I pesci seguono un modello ad agenti (Boids di Craig Reynolds) potenziato con vincoli biologici:
    1. **Separazione**: Evitano di urtare i compagni vicini.
    2. **Allineamento**: Si sintonizzano sulla direzione media del banco.
    3. **Coesione**: Mantengono unito il gruppo.
    4. **Fasce di Profondità (Depth Bands)**: 5 fasce orizzontali (da 0 vicino al vetro a 4 sul fondo) per rispettare le abitudini di specie diverse.
    5. **Seabed Clearance**: Una forza repulsiva progressiva che allontana il pesce dalla superficie rocciosa e sabbiosa prima che possa compenetrarla.
    6. **Saccadi dello Sguardo ([`src/sim/gaze.ts`](file:///F:/progetti/Aquaria/src/sim/gaze.ts))**: Gli occhi anticipano la virata ruotando prima che l'intero corpo compia la curva, conferendo un senso di vita naturale.
    7. **Reazioni**, in ordine di urgenza: paura di un colpo sul vetro, fame per i fiocchi di cibo ([`src/sim/food.ts`](file:///F:/progetti/Aquaria/src/sim/food.ts)), curiosità per un dito sul vetro. Ogni specie le regola con `behavior.appetite`, `curiosity` e `shyness` in `species.json`.
  - **Un "rig" procedurale al posto dello scheletro**: la simulazione calcola per ogni pesce alcuni valori che fanno da articolazioni e lo shader deforma il corpo di conseguenza ([`src/sim/posture.ts`](file:///F:/progetti/Aquaria/src/sim/posture.ts)): `bend` piega la parte posteriore del corpo lungo l'arco che il pesce percorre (curvatura per lunghezza del corpo, fino alla "C" della fuga), `effort` scala il colpo di coda con velocità e accelerazione, `mouth` abbassa la mandibola prima del morso. Quando arriveranno i pesci glTF, gli stessi canali guideranno le loro animazioni.
  - I pesci entrano ed escono dalle pareti laterali virtuali, donando la sensazione di una finestra aperta su un mare infinito anziché di una gabbia chiusa.

---

### Illuminazione Fotobiologica a 4 Canali e Fluorescenza dei Coralli

- **Il Motivo**: Le luci convenzionali nei motori grafici (una luce direzionale gialla o bianca) non rendono giustizia all'ambiente marino. I coralli e gli anemoni vivi contengono proteine fluorescenti (GFP/RFP) che reagiscono fisicamente a precise frequenze elettromagnetiche.
- **Cosa è stato fatto**:
  - Abbiamo sviluppato un modello a 4 canali LED (Bianco, Attinico 450nm, Viola 420nm, Accento) con intensità spettrali calibrate.
  - Uno shader GLSL dedicato ([`src/render/shaders/fluorescencePatch.ts`](file:///F:/progetti/Aquaria/src/render/shaders/fluorescencePatch.ts)) calcola quanta radiazione blu e viola colpisce ciascun corallo, facendolo risplendere al crepuscolo con i tipici toni luminescenti delle barriere coralline tropicali.
  - All'alba, il canale blu si accende prima del bianco; al tramonto, il bianco si spegne per primo lasciando spazio alla luce attinica, esattamente come avviene nei moderni sistemi di acquariofilia avanzata.

---

### Formato Dati Dichiarativo e Validazione Stretta con Zod

- **Il Motivo**: I file di configurazione scritti a mano o importati dall'utente spesso contengono errori (es. colori esadecimali errati, numeri negativi, nomi mancanti) che in runtime causano crash silenziosi o shader neri senza spiegazione.
- **Cosa è stato fatto**:
  - Ogni elemento è validato tramite schemi [Zod](https://zod.dev) al momento del caricamento ([`src/scene/schema.ts`](file:///F:/progetti/Aquaria/src/scene/schema.ts)).
  - Se un parametro non è valido, l'applicazione non crasha: segnala con estrema precisione il campo, il valore atteso e il motivo dell'errore (sia nella console che nell'interfaccia dello Scene Designer).

---

### Texture Compresse KTX2 per la Memoria VRAM a 4K

- **Il Motivo**: Una normale immagine PNG o JPEG a risoluzione 4K (3840×2160) o 2K viene decompressa dal browser per essere caricata in memoria video come bitmap RGBA grezza, occupando fino a 60-80 MB di memoria VRAM per ogni singola texture. Moltiplicando per dozzine di rocce, fondali e piante, la memoria video della GPU si esaurisce in fretta.
- **Cosa è stato fatto**:
  - Tutte le texture fotografiche ([`public/assets/materials/`](file:///F:/progetti/Aquaria/public/assets/materials/)) sono salvate in formato KTX2 con compressione Basis Universal / UASTC.
  - Le texture KTX2 rimangono compresse **direttamente all'interno della VRAM della GPU** e vengono decompresse in tempo reale dai chip hardware della scheda grafica. Questo riduce l'occupazione di memoria di circa il 75% e velocizza notevolmente i tempi di caricamento.

---

### Pipeline di Post-Processing Modulare

- **Il Motivo**: In molti motori, aggiungere un effetto di post-processing (come SSAO o Depth of Field) richiede di modificare complesse pipeline centralizzate o shader monolitici difficili da manutenere.
- **Cosa è stato fatto**:
  - Ogni effetto è incapsulato in un modulo autonomo che implementa l'interfaccia [`EffectDefinition`](file:///F:/progetti/Aquaria/src/render/effects/types.ts).
  - L'effetto dichiara lo stadio di rendering (prima o dopo la mappatura tonale), il suo schema di parametri Zod con valori predefiniti, la logica di cleanup e il suo interruttore per il pannello utente.
  - Tutti gli effetti sono registrati in un unico array in [`src/render/effects/index.ts`](file:///F:/progetti/Aquaria/src/render/effects/index.ts#L14). L'aggiunta di un nuovo effetto richiede solo la creazione del suo file e il suo inserimento nella lista, senza modificare il resto dell'engine.
