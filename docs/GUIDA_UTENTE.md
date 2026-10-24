# Guida all'uso

_English version: [USER_GUIDE.md](USER_GUIDE.md)._

Questa pagina spiega il pannello di controllo e l'editor delle scene. I
tasti e come avviare Aquaria sono nel [README](../README.it.md); quello che
si può fare con i pesci è in [Giocare con i pesci](INTERAZIONE.md).

## Il pannello di controllo

Premi `H`, oppure il pulsante tondo che compare nell'angolo quando muovi il
mouse. Il pannello ha quattro schede:

- **Tank**: cosa c'è nella vasca, la scena, i pesci, le piante e gli
  oggetti;
- **Light**: l'ora e la lampada;
- **Picture**: come si disegnano l'acqua e la luce, e gli effetti;
- **System**: lo schermo, il suono e le informazioni (About).

Ogni sezione di una scheda si chiude e si riapre dal titolo. Il pannello
ricorda la scheda e le sezioni che hai lasciato chiuse; tutto quello che
cambi viene salvato nel browser. La ⓘ accanto al nome della scena apre
About.

### Tank

#### Scene

Una scheda per ogni scena, poi le tue sotto **My scenes**. Clicca per
aprirne una. L'ultima scheda, **Editor**, apre l'[editor delle scene](#leditor-delle-scene).

#### Fauna

Una scheda per ogni specie, con l'immagine del pesce disegnata dal vivo e
un cursore per quanti ce ne sono. Le specie già in vasca vengono prima.
Quando aggiungi pesci entrano nuotando dai lati; quando ne togli, se ne
vanno nuotando.

- Il bollino **3D** sull'immagine vuol dire che la specie ha un modello 3D.
  Cliccalo per passare dal modello al pesce disegnato da Aquaria, più
  leggero. **All 3D** e **None 3D** lo fanno per tutte le specie. Su un
  computer lento, meno modelli aiutano.
- **Fish size** ingrandisce i pesci piccoli e rimpicciolisce quelli grandi,
  così si vedono tutti. A 0% le misure sono vere; a 100% tutte le specie
  sono grandi uguali. Di partenza è 60%.
- **Realistic** spegne i giochi (ipnosi, solletico) e fa rispettare ai
  pesci i loro orari: i pesci diurni la notte riposano, quelli notturni si
  svegliano.

#### Scenery

Una scheda per ogni gruppo di piante e oggetti della scena, con un cursore
per quanti sono. Aggiungerne non sposta quelli che ci sono già.

L'ultima scheda, **+**, apre una finestra con tutte le piante e gli oggetti
che la scena non ha, con un campo di ricerca: una felce nella Hero, un
corallo cervello nel Planted tank. Quello che scegli entra nella griglia con
una scheda sua, in scala con la vasca, e resta lì anche la volta dopo. La
sua **×** lo toglie di nuovo.

### Light

La vasca è illuminata come un acquario di barriera: quattro canali LED
(bianco, blu, viola e un colore libero) e una debole luce lunare blu di
notte. Con la luce blu e viola coralli e anemoni diventano fluorescenti.

Le due sezioni partono su **Recommended**, l'impostazione suggerita dalla
scena. Appena tocchi un comando passano a **Custom**.

**Time** decide che ora è nella vasca:

- _Hour at start_: l'ora in cui hai aperto l'acquario, poi resta ferma.
- _Fixed hour_ (di partenza, le 13): sempre l'ora che scegli.
- _Real clock_: segue l'orologio del computer.
- _Accelerated day_: una giornata intera nei minuti che scegli.

Puoi anche regolare alba (all'inizio alle 6), tramonto (alle 19) e quanto
durano. Il blu si accende un po' prima del bianco e si spegne un po' dopo,
come sulle barriere vere.

**Lights** sceglie la lampada (il cielo aperto, oppure una fila di faretti
LED sopra l'acqua, e quanti), il colore e l'intensità di ogni canale, e la
luce lunare. La luce lunare si vede solo di notte: a 0% dopo il tramonto la
vasca diventa buia, a 30% è una notte azzurra in cui i pesci si vedono
ancora.

### Picture

#### Look

Il look è la composizione di acqua e luce: quanto è luminosa l'immagine,
dove sta il sole, come l'acqua spegne i colori con la distanza, i raggi, il
contrasto e i colori. **Look** lo sceglie: quello della scena, **Hero**
(il mare aperto del manifesto, con le onde in superficie e la cornice della
vasca) o **None** (ogni effetto al suo valore predefinito).

Sotto ci sono l'esposizione, la **Marine snow** (i puntini sospesi
nell'acqua: 0 è acqua cristallina, 1 il mare aperto, fino a 3 torbida) e
l'altezza e la direzione del sole. Le impostazioni di ogni effetto stanno
sotto il suo interruttore, più in basso. Le tue modifiche restano per ogni
look; **Reset this look** le dimentica.

#### Lighting ed Effects

Ogni effetto ha il suo interruttore, così decidi tu dove spende il tempo la
scheda grafica. Un effetto con delle impostazioni ha accanto **Settings**,
che apre i suoi slider sotto l'interruttore. Deep water light contiene
l'acqua stessa: quanto in fretta svaniscono rosso, verde e blu, quanta
acqua dietro il vetro resta limpida prima che inizi il velo, quanto si
scurisce scendendo in profondità, la luce diffusa guardando in basso, di
fronte e in alto, l'alone del sole e i raggi.

| Interruttore          | Cosa fa                                                     | All'avvio    |
| --------------------- | ----------------------------------------------------------- | ------------ |
| Caustics              | La rete di luce che si muove su sabbia, rocce e pesci       | acceso       |
| Shadows               | Le ombre di pesci, rocce e piante                           | se c'è posto |
| Water reflections     | La luce dell'acqua intorno alla vasca                       | se c'è posto |
| Surface waves (alpha) | La superficie mossa con il sole che filtra (non finito)     | spento       |
| Refractive bubbles    | Bolle che piegano la luce come il vetro                     | se c'è posto |
| Light shaft planes    | Raggi di luce economici; inutili con la luce volumetrica    | spento       |
| Coral fluorescence    | Coralli e anemoni brillano con il blu e il viola            | acceso       |
| Tank frame            | Montanti scuri ai lati e il mobile sotto il vetro           | spento       |
| Ambient occlusion     | Pieghe e angoli più scuri                                   | spento       |
| Volumetric light      | Raggi di luce nell'acqua, interrotti da pesci e alghe       | se c'è posto |
| Depth of field        | Sfoca quello che è fuori fuoco                              | spento       |
| Bloom                 | Un alone morbido attorno ai punti più luminosi              | se c'è posto |
| SMAA anti-aliasing    | Bordi sottili più puliti (erba, pinne)                      | spento       |
| Vignette and dither   | Angoli più scuri, e niente bande di colore sulle pareti LED | se c'è posto |

"Se c'è posto" vuol dire che Aquaria lo prova all'avvio. Per una quindicina
di secondi accende questi effetti uno alla volta e tiene ognuno solo se la
scheda grafica ce la fa ancora. Un interruttore che tocchi tu non viene più
cambiato.

L'ambient occlusion è di gran lunga il più pesante, e la profondità di
campo su una parete vista da lontano sembra solo sfocatura: restano spenti
finché non li accendi tu.

**Fit effects to this screen**, in fondo alla scheda, dimentica gli
interruttori degli effetti che hai cambiato e li adatta di nuovo alla
scheda grafica. Utile dopo aver cambiato il limite di fotogrammi.

### System

#### Screen

- **Resolution**: da 540p a 4K. Con **Automatic resolution** accesa (di
  partenza) Aquaria la abbassa quando la scheda grafica fatica e la rialza
  quando c'è margine, mai oltre il cursore. Così non si prende mai tutta la
  scheda grafica e lo schermo non si blocca.
- **Frame limit**: 30 (di partenza) o 60 fotogrammi al secondo, oppure
  nessun limite. Un limite lascia la scheda grafica libera per il resto del
  computer e fa durare di più la batteria.
- **Anti-aliasing**: MSAA spento, 2×, 4× o 8×.
- **Show FPS**: fotogrammi al secondo e risoluzione davvero disegnata.
- **Full screen** (anche `F`).
- La scheda grafica in uso, con un avviso se è quella integrata, la più
  debole. Il README spiega [come sistemarlo](../README.it.md#usare-la-scheda-grafica-dedicata).

#### Sound

Acceso o spento (anche `M`), e il volume: il gorgoglio, il colpo sul
vetro, il cibo, la torcia e la lente.

#### About

La versione e il commit da cui è stata costruita, l'autore, la licenza e
un link al codice; poi ogni tasto e cosa fa. **Reset Aquaria**: due clic
dimenticano le tue impostazioni e riscaricano tutti i modelli e le
texture. Usalo se un browser continua a mostrare qualcosa di vecchio dopo
un aggiornamento; le tue scene restano.

## L'editor delle scene

Premi `E`, o clicca la scheda **Editor**. La vasca si vede dall'alto, di
sbieco, senza acqua, pesci ed effetti. Funziona con il mouse o con un dito.

- **Muoversi**: trascina con il tasto destro (o due dita) per spostare la
  vista, usa la rotella (o pizzica) per lo zoom, ⟲ ⟳ per ruotare di un
  quarto di giro.
- **Roccia**: `＋` aggiunge blocchi dove punti, `－` li toglie. **Brush**
  decide quanti alla volta. **Layers** nasconde gli strati più alti, per
  lavorare dentro una grotta. **Smooth** mostra la roccia come sarà in
  vasca. La scheda **Rocks** della tavolozza sceglie la pietra.
- **Piante e oggetti**: scegline uno nella scheda **Plants** o **Objects**
  e tocca la sabbia o una roccia per posarlo. 🖌 ne dipinge tanti insieme
  (un prato, un ciuffo, sassolini sparsi); **Density** decide quanto fitti.
  ☝ seleziona un elemento per spostarlo, ruotarlo (↺ ↻), ridimensionarlo
  (▫ ▢), cambiargli colore o cancellarlo (🗑 o `Canc`). Se togli la roccia
  sotto qualcosa, quello scende su ciò che sta sotto.
- **Scheda Scene**: parti dall'acqua, dal fondo, dalla luce e dalla
  corrente di una delle scene incluse, poi cambia le misure della vasca,
  l'acqua e quanto è torbida, il fondo, lo sfondo, la luce e la corrente.
  Esporta la scena in JSON, importane una, o cancella una delle tue.
- `Ctrl+Z` e `Ctrl+Y` annullano e ripetono. Scrivi un nome nella barra,
  poi **Save** (o **Save as new**). `Esc` esce senza salvare.

Le tue scene restano in questo browser, sotto **My scenes**. La prima volta
che una viene mostrata, la sua scheda prende una foto della vasca.

Per includere una scena in Aquaria, vedi
[Scrivere scene e specie](SCRIVERE_SCENE.md#dove-stanno-le-cose).
