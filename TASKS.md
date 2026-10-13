# Elenco Attività e Roadmap (Tasks) — Aquaria

Documento riassuntivo delle attività pianificate, verifiche in sospeso e sviluppi futuri da affrontare nelle prossime sessioni.

---

## 1. Verifiche Immediate e Qualità del Codice

- [ ] **Formattazione del codice**:
  - Eseguire `pnpm format:check` per verificare la formattazione Prettier sui file modificati.
  - Eseguire `pnpm format` qualora vi siano differenze di indentazione o stile.
- [ ] **Suite di Test e Controllo Statico**:
  - Eseguire `pnpm lint` (ESLint strict).
  - Eseguire `pnpm typecheck` (`tsc --noEmit`).
  - Eseguire `pnpm test` (382 test unitari Vitest).
- [ ] **Verifica finale Git**:
  - Eseguire `git status` / `git diff` per revisionare i file creati e aggiornati:
    - [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md)
    - [`docs/GUIDA_UTENTE.md`](docs/GUIDA_UTENTE.md)
    - [`README.md`](README.md)
    - [`TASKS.md`](TASKS.md)

---

## 2. Documentazione e Risorse Visive

- [ ] **Diagrammi Architetturali**:
  - Aggiungere diagrammi di flusso visivi o esportare grafici SVG/Mermaid per la cartella `docs/` (es. pipeline degli shader, flusso di steering dei boids, diagramma dei livelli architetturali).
- [ ] **Esempi di Scene e Template JSON**:
  - Creare un file di template annotato per la composizione rapida di nuove scene via editor di testo.

---

## 3. Sviluppi Futuri dalla Roadmap del Progetto

- [ ] **Nuove Scene Predefinite**:
  - Creare la scena _Mediterranean Seagrass_ (prateria di posidonia).
  - Creare la scena _Jellyfish Room_ (vasca scura per meduse con illuminazione luminescente).
  - Creare la scena _Shark Tunnel_ (ambiente oceanico profondo).
- [ ] **Sfondo a Più Livelli con Parallasse**:
  - Supporto per backdrop a strati di immagini con effetto parallasse al movimento o alla rotazione.
- [ ] **Modelli 3D glTF e Animazioni Scheletriche**:
  - Integrazione di modelli glTF/GLB animati (es. pesci CC0 Quaternius con animazioni di nuoto riggate) in affiancamento al corpo procedurale MVP attuale.
- [ ] **Renderer WebGPU (Shaders TSL)**:
  - Preparare l'adattatore WebGPU isolato per Three.js per trarre vantaggio delle nuove API grafiche moderne.
- [ ] **Interazioni Post-MVP**:
  - Telecomando da smartphone (alimentazione dei pesci, tocco sul vetro virtuale).
  - Rilevamento presenza da webcam e prospettiva con head-tracking.
