# Effetti fatti di file

Un effetto di post-processing può essere una cartella di file invece che
codice: un breve `effect.json` e uno shader GLSL dei frammenti. Aquaria lo
carica all'avvio accanto ai suoi effetti e gli dà un interruttore nel
pannello, sotto _Post-processing_. Non serve ricompilare niente.

Uno shader gira solo sulla GPU e può leggere soltanto l'immagine e i numeri
che Aquaria gli passa, quindi caricare un file di effetto è sicuro.

## La cartella

```
public/effects/
  index.json          elenca le cartelle degli effetti
  shimmer/
    effect.json       che cos'è l'effetto (sotto)
    effect.glsl       il suo shader dei frammenti
```

Aggiungi il nome della cartella a `index.json`:

```json
{ "effects": ["shimmer"] }
```

## `effect.json`

```json
{
  "name": "Water shimmer",
  "stage": "hdr",
  "startup": "manual",
  "shader": "effect.glsl",
  "params": {
    "amount": { "min": 0, "max": 0.01, "default": 0.0015 },
    "speed": { "min": 0, "max": 3, "default": 0.7 }
  }
}
```

| Campo     | Significato                                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`    | L'etichetta dell'interruttore nel pannello.                                                                                                                                                                        |
| `stage`   | `hdr`: sull'immagine lineare, prima del tone mapping (luce, bagliore, distorsione). `display` (predefinito): sui colori finali (correzione colore, grana).                                                         |
| `startup` | `manual` (predefinito): spento finché il viewer non lo accende. `added`: acceso all'avvio se la GPU ha margine, dopo gli effetti di Aquaria. `base`: sempre acceso; solo per effetti che non costano quasi niente. |
| `shader`  | Il file dello shader nella cartella; `effect.glsl` se manca.                                                                                                                                                       |
| `params`  | Le impostazioni, ognuna un `uniform float` con lo stesso nome nello shader, con il suo intervallo e il valore tarato. I nomi sono nomi GLSL: una lettera minuscola, poi lettere e cifre.                           |
| `credit`  | Per un effetto non tuo: `author`, `source` (URL) e `license`, una licenza che permetta riuso, modifiche e ridistribuzione, anche commerciale (vedi `ASSETS.md`).                                                   |

## Lo shader

Scrivi le funzioni di appoggio e `main()`; Aquaria mette prima queste
dichiarazioni:

| Nome           | Tipo        | Che cos'è                                               |
| -------------- | ----------- | ------------------------------------------------------- |
| `tDiffuse`     | `sampler2D` | L'immagine fin qui.                                     |
| `vUv`          | `vec2`      | Dove si trova il pixel, da 0 a 1 attraverso l'immagine. |
| `uTime`        | `float`     | Il tempo dell'acquario, in secondi.                     |
| `uResolution`  | `vec2`      | Dimensione dell'immagine disegnata, in pixel.           |
| `uFrame`       | `float`     | Fotogrammi disegnati da quando l'effetto è acceso.      |
| ogni parametro | `float`     | Il suo valore, quello predefinito di `effect.json`.     |

Scrivilo come per WebGL 1 (`texture2D`, `gl_FragColor`); Aquaria lo compila
come GLSL ES 3.00 per WebGL 2. Gli `#include` di Three.js non sono
disponibili.

```glsl
// Water shimmer: l'immagine tremola appena.
void main() {
  vec2 p = vUv * 14.0;
  float t = uTime * speed;
  vec2 shift = vec2(sin(p.y + t), cos(p.x + t)) * amount;
  gl_FragColor = texture2D(tDiffuse, vUv + shift);
}
```

## Provarlo

1. Lancia `pnpm dev`, apri l'acquario, premi `H` e accendi l'effetto sotto
   _Post-processing_. `?effects=shimmer` apre la vasca con quell'effetto
   soltanto.
2. Dopo una modifica allo shader, ricarica la pagina.
3. Se l'interruttore manca, la console del browser dice perché:
   `effect.json` non è valido, l'id è già usato da una funzione di Aquaria,
   o lo shader non compila (con il messaggio del compilatore). Un effetto
   rotto resta fuori; il resto dell'acquario funziona come sempre.
4. Indica quanto costa: accendi _Show FPS_ nella sezione Quality e
   confronta con l'effetto acceso e spento a 4K. Un effetto pesante resta
   `manual`.
