# Effetti fatti di file

_English version: [EFFECTS.md](EFFECTS.md)._

Puoi aggiungere un effetto di post-processing senza toccare il codice: una
cartella con un breve `effect.json` e uno shader GLSL. Aquaria lo carica
all'avvio e gli dà un interruttore nel pannello, sotto _Post-processing_.
Non serve ricompilare niente.

Uno shader gira solo sulla scheda grafica e vede solo l'immagine e i
numeri che gli passa Aquaria, quindi caricarne uno è sicuro.

## La cartella

```
public/effects/
  index.json          l'elenco delle cartelle degli effetti
  shimmer/
    effect.json
    effect.glsl
```

Aggiungi il nome della cartella a `index.json`:

```json
{ "effects": ["shimmer"] }
```

## effect.json

Questo è il _Water shimmer_ che arriva con Aquaria:

```json
{
  "name": "Water shimmer",
  "stage": "hdr",
  "startup": "manual",
  "shader": "effect.glsl",
  "params": {
    "amount": { "min": 0, "max": 0.01, "default": 0.0015 },
    "speed": { "min": 0, "max": 3, "default": 0.7 },
    "scale": { "min": 1, "max": 60, "default": 14 }
  }
}
```

| Campo     | Cos'è                                                                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`    | L'etichetta dell'interruttore                                                                                                                                                            |
| `stage`   | `hdr` lavora sulla luce grezza, prima dei colori finali (bagliori, distorsioni). `display` (di partenza) lavora sui colori finali (correzione colore, grana)                             |
| `startup` | `manual` (di partenza): spento finché qualcuno non lo accende. `added`: acceso all'avvio se la scheda grafica ha margine. `base`: sempre acceso, solo per effetti che non costano niente |
| `shader`  | Il file dello shader, `effect.glsl` se non diversamente indicato                                                                                                                         |
| `params`  | Impostazioni: ognuna diventa un `uniform float` con lo stesso nome nello shader. Nomi in minuscolo, lettere e cifre                                                                      |
| `credit`  | Se l'ha scritto qualcun altro: `author`, `source` e `license`                                                                                                                            |

## Lo shader

Scrivi `main()` ed eventuali funzioni di aiuto. Aquaria aggiunge per te:

| Nome          | Tipo        | Cos'è                                             |
| ------------- | ----------- | ------------------------------------------------- |
| `tDiffuse`    | `sampler2D` | L'immagine fin qui                                |
| `vUv`         | `vec2`      | La posizione del pixel, da 0 a 1                  |
| `uTime`       | `float`     | Il tempo dell'acquario, in secondi                |
| `uResolution` | `vec2`      | La misura dell'immagine in pixel                  |
| `uFrame`      | `float`     | Fotogrammi disegnati da quando l'effetto è acceso |
| ogni param    | `float`     | Il suo valore attuale                             |

Scrivilo alla maniera di WebGL 1 (`texture2D`, `gl_FragColor`); Aquaria lo
converte.

Una versione semplificata dello shader dello shimmer:

```glsl
// L'immagine tremola un poco, come vista attraverso l'acqua mossa.
void main() {
  vec2 p = vUv * scale;
  float t = uTime * speed;
  vec2 shift = vec2(sin(p.y + t), cos(p.x + t)) * amount;
  gl_FragColor = texture2D(tDiffuse, vUv + shift);
}
```

## Provarlo

1. Avvia `pnpm dev`, premi `H` e accendi l'effetto sotto
   _Post-processing_. Oppure apri `?effects=shimmer` per vederlo da solo.
2. Dopo aver cambiato lo shader, ricarica la pagina.
3. Se l'interruttore non compare, la console del browser dice perché: un
   errore in `effect.json`, un nome già usato, o uno shader che non
   compila (con il messaggio del compilatore). Il resto dell'acquario gira
   comunque.
4. Controlla quanto costa: accendi _Show FPS_ nella sezione Quality e
   confronta con l'effetto acceso e spento. Un effetto pesante deve restare
   `manual`.

## Gli effetti di Aquaria

Il [look](SCRIVERE_SCENE.md#look) di una scena può cambiare anche le
impostazioni degli effetti di Aquaria. Questi sono i loro id e le loro
impostazioni; ognuna ha un valore predefinito.

| Id                  | Impostazioni                                                                                                                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `underwater`        | `strength` (0 = spento), `absorption` (quanto svaniscono rosso, verde e blu per metro), `farDistance`, `clearWater`, `depthDarkening`, `deep`, `horizon`, `surface`, `brightness`, `sunColor`, `sunGlow`, `sunFocus`, `shafts`, `shaftCount` |
| `ambient-occlusion` | `radius`, `intensity`, `samples`, `thickness`                                                                                                                                                                                                |
| `volumetric-light`  | `density`, `decay`, `weight`, `exposure`, `threshold`, `samples`                                                                                                                                                                             |
| `depth-of-field`    | `focus`, `aperture`, `maxBlur`                                                                                                                                                                                                               |
| `bloom`             | `strength`, `radius`, `threshold`                                                                                                                                                                                                            |
| `finish`            | `vignette`, `dither`, `contrast`, `saturation`, `tint`                                                                                                                                                                                       |

`underwater` legge la profondità dell'immagine, quindi va sempre per primo.
Costa un passaggio a schermo intero: circa 4 ms su 112 ms a 3840×2160 su
una GPU integrata Intel.
