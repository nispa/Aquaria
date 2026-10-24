# Come è fatto Aquaria

_English version: [ARCHITECTURE.md](ARCHITECTURE.md)._

Un giro veloce tra le scelte principali, per chi vuole mettere mano al
codice. Le regole che ne derivano (prima i test, niente allocazioni a ogni
fotogramma e così via) sono in [AGENTS.md](../AGENTS.md).

## Perché una pagina web

Aquaria deve girare per giorni su un computer dietro uno schermo, in un
luogo pubblico. Una pagina web è la cosa più semplice da mettere lì: si
compila una volta, si copia una cartella, si apre nel browser. Niente
installazione, niente runtime, e un aggiornamento è una cartella nuova.
Three.js dà abbastanza controllo sulla scheda grafica per quello che serve
a un acquario, e il tutto resta leggero.

## I livelli

```
core    numeri, generatore casuale, orologio, bus degli eventi
scene   i file JSON: cosa possono contenere, caricamento, controllo
sim     i pesci e tutto ciò che si muove: dove andare, cosa fare
render  il disegno con Three.js
audio   i suoni
ui      il pannello e le scritte sopra la vasca
input   mouse e tocco
app     mette tutto insieme e fa girare il ciclo
```

Ogni livello usa solo quelli sopra di lui in questa lista. La regola
importante è che `core`, `scene` e `sim` non toccano mai il browser né la
scheda grafica. Così tutta la simulazione gira in Node.js puro, e si può
testare in fretta e senza schermo: un test può buttare cibo in una vasca,
far passare un minuto e controllare chi ha mangiato.

`render` si limita a leggere quello che ha deciso `sim`. Non fa mai fare
niente a un pesce.

## I pesci si orientano, non seguono percorsi

A ogni fotogramma ogni pesce riceve qualche piccola spinta: stai lontano
dai vicini, resta con il branco, resta nella tua parte di vasca, stai
lontano dalle rocce. In più, lo stile di nuoto della specie dice dove
vorrebbe andare, e l'attività del momento (beccare, riposare, nascondersi)
può prendere il comando. Il risultato non è mai scritto in anticipo, e
aggiungere un comportamento vuol dire aggiungere una spinta o un desiderio,
non riscrivere un percorso. I dettagli sono in [Stili di nuoto](NUOTO.md).

Il corpo segue il movimento: la simulazione calcola quanto il pesce sta
girando, quanto batte la coda, se ha la bocca aperta, e lo shader piega e
anima il modello con quei pochi numeri. Per questo un intero branco della
stessa specie si disegna in un colpo solo, anche se mescola più ceppi:
ogni pesce legge la sua colorazione da un unico texture array.

## Dati, controllati all'ingresso

Scene, specie, piante, oggetti, effetti: è tutto JSON, controllato con
[Zod](https://zod.dev) al caricamento. Un errore ferma l'acquario con il
nome del campo sbagliato, invece di un'immagine strana o di un crash dieci
minuti dopo. Dentro il programma i dati sono poi dati per buoni.

Aggiungere una scena, una specie, una pianta o un effetto non dovrebbe mai
richiedere codice nuovo. Se succede, al motore manca qualcosa.

## Fotogrammi regolari

L'acquario deve restare acceso tutto il giorno. JavaScript ogni tanto
libera la memoria fermando il programma per un attimo, e a 60 fotogrammi al
secondo quella pausa si vede come uno scatto. Per questo il codice che gira
a ogni fotogramma non crea mai oggetti nuovi: riusa sempre gli stessi
vettori e array.

Lo stesso vale per la scheda grafica: la risoluzione segue quello che la
scheda riesce a fare, gli effetti pesanti si accendono solo se c'è
margine, e le texture dell'arredamento sono file KTX2 che restano
compressi nella memoria video. Fanno eccezione i pesci dipinti dai nostri
script Blender: le loro piccole texture WebP vengono spacchettate sulla
GPU, pochi megabyte per specie.

## Effetti come plug-in

Ogni effetto di post-processing è un file (o una cartellina di file, vedi
[Effetti fatti di file](EFFETTI.md)) che dice il suo nome, le sue
impostazioni di partenza e come costruirsi. Il pannello lo trova in una
lista. Aggiungerne uno non tocca il resto del motore.
