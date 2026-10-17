# Fare un pesce in Blender

Una specie può avere un modello 3D accanto al suo corpo procedurale: una
cartella in `public/assets/species/<id>/` con un `model.glb` e un
`model.json` (i campi sono nel README, "3D fish models"). Questa guida
spiega come farne uno in Blender perché Aquaria lo faccia nuotare, gli apra
la bocca e gli muova gli occhi. `scripts/blender/angelfish.py` e
`scripts/blender/guppy.py` costruiscono così lo scalare (angelfish d'acqua
dolce) e il guppy, da codice, con le parti comuni in
`scripts/blender/fishkit.py`: leggili come esempi completi.

## Che cosa fa Aquaria con il modello

Aquaria disegna tutti i pesci di una specie in un colpo solo sulla GPU
(instancing), quindi non riproduce animazioni scheletriche. Prende il
modello com'è nella posa di riposo e fa il resto nei suoi shader:

- lo gira, lo centra e lo scala alla lunghezza della specie;
- piega la parte posteriore del corpo per nuotare e girare (`swimAmplitude`);
- apre la bocca con uno shape key, quando il pesce mangia (`mouth`);
- gira i bulbi oculari dove il pesce sta per girare (`eyes`);
- fa respirare gli opercoli delle branchie (`gills`).

Un'armatura è benvenuta, per gli occhi e per gli altri programmi, ma non
serve nessuna animazione. Anche un modello preso altrove, con gli occhi solo
dipinti sulla texture e senza shape key, può fare tutto questo, senza
Blender: vedi la sezione 7.

## Il riferimento del pesce e il visore dei modelli

I punti del pesce (un occhio, la bocca, gli opercoli) si danno nel
**riferimento del pesce**, quello in cui Aquaria porta ogni modello: una
lunghezza di corpo lungo x, dalla coda a -0,5 al muso a +0,5, la pinna
dorsale in alto (+y), in lunghezze di corpo. Si leggono sul visore dei
modelli: lancia `pnpm dev` e apri

```
http://localhost:5173/model-viewer.html?id=<cartella del modello>
```

Disegna il modello dal lato destro, come lo prepara Aquaria, con sopra la
griglia del riferimento del pesce. Nell'URL si possono mettere anche `gaze`
(-1..1), `mouth` (0..1), `breath` (0..1) e `zoom=x,y,mezzaLarghezza`, per
guardare da vicino occhi, bocca e branchie nelle posizioni estreme.

## 1. Forma e dimensioni

- Modella il pesce lungo il **+X** di Blender (il muso) con la pinna dorsale
  in alto (**+Z**). L'esportatore glTF trasforma il +Z in alto in +Y in
  alto, quindi `model.json` dice `"forward": "+x", "up": "+y"`. Va bene
  anche un altro orientamento: basta dire quali assi puntano al muso e alla
  pinna dorsale.
- Le dimensioni non contano: Aquaria scala il pesce alla lunghezza della
  specie, misurata dal muso alla punta della coda.
- Tieni la testa davanti alla metà del corpo: Aquaria tiene rigido il primo
  quinto del pesce e piega il resto.
- Da 5.000 a 20.000 triangoli bastano e avanzano. Le pinne possono essere
  fogli singoli: Aquaria disegna entrambi i lati.

## 2. Colori e materiali

Usa materiali Principled BSDF: l'esportatore li trasforma in materiali glTF
PBR, che Aquaria conserva (colore base, normali, rugosità, metallicità,
trasparenza). I colori possono essere texture o un attributo colore (colori
per vertice) collegato a _Base Color_; esportalo con _Data > Mesh > Vertex
Color: Active_. Le pinne rendono meglio un po' trasparenti: alfa sotto 1 e
_Blend Mode: Blended_.

## 3. La bocca

Aggiungi uno shape key, per esempio `MouthOpen`, con la bocca spalancata (la
mandibola abbassata), e indicalo in `model.json`:

```json
"mouth": { "morphTarget": "MouthOpen" }
```

## 4. Gli occhi

Gli occhi guardano a scatti verso dove il pesce sta per girare, come quelli
di un pesce vero. Ad Aquaria serve sapere quali vertici sono bulbo oculare e
dov'è il centro di ogni bulbo:

1. Fai di ogni bulbo una parte separata della mesh (o un oggetto a parte):
   una sfera, o la sua parte anteriore, con la pupilla rivolta di lato.
2. Aggiungi un'armatura con un osso radice per il corpo e **un osso per
   occhio**, per esempio `Eye.L` ed `Eye.R`. Metti la **testa** di ogni osso
   dell'occhio **al centro del suo bulbo**: Aquaria gira l'occhio attorno a
   quel punto. Imparenta le ossa degli occhi all'osso radice. (La sinistra
   del pesce è il +Y di Blender.)
3. Imparenta le mesh all'armatura (_With Empty Groups_, o con un modificatore
   Armature) e **dipingi i pesi** di ogni bulbo interamente (1,0) sul suo
   osso; corpo e pinne vanno all'osso radice. I vertici pesati in parte su un
   osso dell'occhio girano in parte, utile per sfumare una palpebra o un
   bordo.
4. Lascia l'armatura nella posa di riposo; non serve nessuna animazione.
5. Indica le ossa in `model.json`, e di quanti gradi girano al massimo gli
   occhi (20 se manca, al massimo 45):

```json
"eyes": { "bones": ["Eye.L", "Eye.R"], "turn": 22 }
```

Scrivi i nomi delle ossa come li mostra Blender: Aquaria li trova anche dopo
che il caricatore glTF ha tolto i punti (`Eye.L` arriva come `EyeL`).

## 5. Esportazione

_File > Export > glTF 2.0_, formato **glTF Binary (.glb)**, con:

- _Include_: gli oggetti del pesce e l'armatura;
- _Transform_: **+Y Up** attivo;
- _Data > Mesh_: _Apply Modifiers_ spento (l'armatura deve restare una
  skin), _Vertex Color: Active_ se hai dipinto i colori;
- _Data > Shape Keys_ attivo; _Data > Armature_ attivo (skin);
- _Animation_ spento.

Da script, `scripts/blender/angelfish.py` finisce con le stesse impostazioni:

```python
bpy.ops.export_scene.gltf(
    filepath="model.glb", export_format="GLB", export_yup=True,
    export_skins=True, export_morph=True, export_animations=False,
    export_vertex_color="ACTIVE", export_apply=False,
)
```

Poi comprimilo: le ossa, gli shape key e i colori restano, e il file
diventa circa un decimo:

```bash
pnpm dlx @gltf-transform/cli@4.5.1 optimize model.glb public/assets/species/<id>/model.glb --compress meshopt --simplify false
```

Salva `model.glb` nella cartella della specie, scrivi `model.json`, collega
la specie alla cartella (`"model": "<id>"` in `public/species.json`) ed
elenca il modello in `ASSETS.md`. Un modello fatto da zero può essere CC0.

## 6. Controllo

Lancia `pnpm dev`, apri una scena con la specie, premi `H` e verifica che la
scheda della specie mostri il badge **3D** acceso. Premi `A` per la
sovrimpressione delle attività e guarda un pesce che gira: gli occhi
guardano prima. Se gli occhi non si muovono, la console del browser non
segnala errori e i nomi delle ossa sono giusti, controlla che i bulbi siano
pesati sulle ossa degli occhi e non sulla radice.

## 7. Un modello preso altrove

Un modello scaricato ha spesso gli occhi dipinti sulla texture e nessuno
shape key, e le sue texture possono essere in un formato che Blender non
apre (KTX2). `model.json` può dargli comunque bocca, occhi e branchie, con
punti del riferimento del pesce letti sul visore:

```json
"mouth": { "jaw": { "start": 0.43, "line": -0.01, "drop": 0.02 } },
"eyes": { "painted": { "center": [0.37, 0.137], "radius": 0.024, "pupil": 0.72, "iris": "#d6dee6" } },
"gills": { "edge": 0.28, "top": 0.17, "bottom": -0.06, "curve": 3 }
```

- `mouth.jaw`: quando il pesce mangia, i punti davanti a `start` e sotto la
  `line` della bocca scendono fino a `drop` alla punta del muso; il labbro
  superiore si alza un poco. Metti `line` dove si incontrano le labbra.
- `eyes.painted`: un occhio dipinto sopra quello del modello, sui due lati:
  il `center` (x, y), il `radius`, il colore dell'`iris` e la quota del
  raggio occupata dalla `pupil` (0,65 se manca). La pupilla scorre con lo
  sguardo. Fai combaciare il raggio con l'occhio dipinto, così la vecchia
  pupilla resta coperta.
- `gills`: il bordo posteriore dell'opercolo (`edge`, x), fin dove arriva
  in alto e in basso (`top`, `bottom`) e come si piega il bordo (`curve`:
  il bordo sta a `edge + curve * (y - metà)^2`, quindi una curva positiva
  lo porta più indietro a metà altezza, come nella maggior parte dei
  pesci). Si solleva fino a `open` lunghezze di corpo (0,006 se manca),
  `rate` volte al secondo (1,1 se manca), ogni pesce nel suo momento, e
  dietro si vede una fessura rosso scuro. I pesci fatti in Blender
  prendono `gills` allo stesso modo.

Per lanciare lo script dello scalare:

```bash
blender --background --python scripts/blender/angelfish.py -- public/assets/species/freshwater-angelfish
```
