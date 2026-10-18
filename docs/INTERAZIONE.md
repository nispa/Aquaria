# Giocare con i pesci

_English version: [INTERACTION.md](INTERACTION.md)._

Il mouse, o il dito su uno schermo touch, è un dito appoggiato al vetro. I
pesci se ne accorgono.

## Cosa puoi fare

| Tu…                                     | I pesci…                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| Lasci il mouse fermo sulla vasca        | I curiosi vengono a guardarti da dietro il vetro                                        |
| Clicchi sulla vasca                     | Quelli vicini scappano, alcuni vanno a nascondersi; un branco si stringe                |
| Premi `Spazio`                          | Cade del cibo sopra il mouse; i pesci affamati salgono ad azzannarlo                    |
| Disegni cerchi veloci vicino a un pesce | Il pesce è **ipnotizzato**: si ferma, gira con i tuoi cerchi e si rotola                |
| …poi ti fermi                           | Si riprende **stordito**, barcollando per qualche secondo                               |
| Scarabocchi proprio sopra un pesce      | Gli fai il **solletico**: si contorce a pancia in su, poi scappa a zigzag               |
| Premi `T`                               | Il mouse diventa una **torcia**: alcuni pesci si radunano nella luce, i timidi scappano |
| Premi `Z`                               | Una **lente d'ingrandimento** segue il mouse                                            |
| Premi `A`                               | Vedi cosa sta facendo ogni pesce                                                        |
| Premi `M`                               | Suono acceso o spento                                                                   |

Quando muovi il mouse o tocchi lo schermo compaiono dei pulsanti tondi
nell'angolo in alto a destra: punta, torcia, lente, cibo e pannello. Sono
grandi abbastanza per un dito e spariscono dopo qualche secondo.

**Su uno schermo touch** ogni tocco batte sul vetro, perché un dito non
può restare sospeso. Accendi **Point** (`P`) e un tocco punta, come il
mouse fermo: i curiosi si avvicinano, cerchi e scarabocchi funzionano, e
nessuno si spaventa. La torcia e la lente puntano sempre.

Ipnosi e solletico sono giochi, non biologia. Accendi **Realistic** nella
sezione Fauna del pannello e spariscono, mentre i pesci rispettano i loro
orari e di notte riposano. Tutto il resto funziona in entrambi i modi.

## Chi reagisce, e quanto

Ogni specie decide il suo carattere in `public/species.json`, sotto
`behavior`, con valori da 0 a 1:

- `curiosity`: quanti vengono a guardare il tuo dito. Sono sempre gli
  stessi individui, quindi una vasca ha i suoi spettatori fissi.
- `shyness`: da quanto lontano lo spaventa un colpo sul vetro. Un pesce
  audace nota solo i colpi vicini; uno timido, anche quelli dall'altra
  parte della vasca.
- `appetite`: quanto gli piace il cibo. Un pesce sazio ignora il cibo per
  qualche minuto.
- `hiding`: quanti di loro, quando si spaventano, corrono al riparo più
  vicino e ci restano qualche secondo, invece di scappare e basta. I
  ripari sono piante e oggetti con l'etichetta `shelter`: anemoni, coralli,
  alghe, legni. Il pesce pagliaccio si nasconde sempre nel suo anemone.
- `torch`, da -1 a 1: sopra 0 il pesce ama la torcia e si raduna nel
  fascio; sotto 0 la fugge. La torcia rende meglio di notte.

Un pesce spaventato mette in allarme anche il suo branco, che si stringe
per un po'.

## I giochi nel dettaglio

**Ipnosi.** I cerchi devono essere veloci e regolari, circa mezzo giro al
secondo o più. Ogni pesce vicino alla linea che va dal tuo occhio al dito
cade nell'incantesimo in un secondo: quasi si ferma, galleggia, gira con i
tuoi cerchi, si rotola e tiene gli occhi sul tuo dito. Quando ti fermi, un
pesce ipnotizzato a fondo resta stordito per qualche secondo.

**Solletico.** Scarabocchia veloce, avanti e indietro, proprio sopra il
pesce. Dopo un attimo si contorce a pancia in su per un secondo, poi
schizza via a zigzag.

**La torcia.** Un fascio caldo parte dal tuo occhio, passa il vetro ed
entra nella vasca. Mentre è accesa il mouse è una torcia e non un dito:
nessuno viene a guardare, e i cerchi non fanno niente. Colpi e cibo
funzionano come sempre.

**La lente.** Una lente rotonda mostra quello che c'è sotto il mouse tre
volte più grande. Il mouse resta un dito, quindi i curiosi vengono a
guardarti attraverso la lente.

## Vedere cosa succede: `A`

`A` scrive sopra ogni pesce cosa sta facendo (`wander 12s`, `peck ×3`,
`inspect`) o sotto quale incantesimo è (`hypnotized 80%`, `dizzy 3s`), con
una linea verso il posto dove sta andando. Il pesce più vicino al mouse ha
una scheda: specie, misura, stile di nuoto, attività, velocità, quanto è
sazio, quanto è spaventato. Una riga in alto dice cosa sta disegnando il
tuo dito.

Con `A` acceso, `C` disegna le forme che i pesci evitano.

## Chi vince

Quando più cose chiamano un pesce insieme, vince la prima di questa
lista:

1. la paura, dopo un colpo sul vetro;
2. il cibo, se ha fame;
3. un incantesimo: ipnosi, stordimento, solletico;
4. la torcia, oppure la curiosità per il tuo dito;
5. la sua attività (beccare, guardare, riposare);
6. il suo stile di nuoto.

Le prime quattro interrompono l'attività che il pesce stava facendo.

## Per chi sviluppa

Come un gesto arriva ai pesci:

1. `src/input/pointer.ts` trasforma mouse e tocco negli eventi
   `pointer-move`, `pointer-leave` e `tap`.
2. `src/app/main.ts` chiede alla vista dove il puntatore tocca il vetro e
   in che direzione guarda chi osserva, e passa tutto alla simulazione
   (`setFinger`, `tap`, `dropFood`).
3. `src/sim/gesture.ts` segue il dito sul vetro e misura quanto è veloce e
   quanto gira. I cerchi girano sempre nello stesso verso; gli scarabocchi
   girano molto, ma avanti e indietro.
4. `src/sim/play.ts` tiene, per ogni pesce, quanto è ipnotizzato, stordito
   o solleticato, e lo trasforma in desideri (direzione, altezza,
   andatura, coda) e postura (rollio, contorsione, occhi), come fa
   un'attività.

È tutto codice di simulazione puro: niente browser, niente scheda grafica.
I test disegnano cerchi e scarabocchi come liste di punti.

Per aggiungere un nuovo modo di giocare:

1. Se serve un nuovo ingresso (un telefono, una webcam), mettilo in
   `src/input/` e fagli mandare eventi. Niente in `sim` dovrebbe cambiare
   per questo.
2. Trasforma l'ingresso grezzo in qualcosa di significativo con una
   piccola funzione testata, come fa `gesture.ts`.
3. Esprimi la reazione come desideri e postura, e lascia che sia la guida
   a muovere il pesce: così resta fuori dalla roccia e dentro la vasca.
4. Decidi dove sta in [Chi vince](#chi-vince).
5. Mostralo nella sovrimpressione di `A` (`src/ui/activityOverlay.ts`).
6. Descrivilo qui, in tutte e due le lingue.

### Idee per dopo

- Trascini il dito piano e un branco lo segue.
- Un doppio tocco sempre seguito dal cibo: dopo un po' i pesci arrivano al
  doppio tocco anche senza cibo.
- Tieni premuto su un pesce e ti segue finché non lasci.
- Tieni premuto il tasto per soffiare bolle.
- Un telefono come telecomando, o una webcam che si accorge delle persone
  davanti allo schermo.
- Sul telefono, i suoi sensori di movimento: lo inclini e la vista gira un
  poco, come da una piccola finestra; una scossa rapida di lato bussa sulla
  vasca e i pesci scappano a nascondersi.
