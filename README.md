# 🌍 Weltherrschaft

Ein Idle-/Risk-Strategiespiel für den Browser: Du führst dein Reich an, erorberst
angrenzende Regionen und ringst mit fünf computergesteuerten Großmächten um die
Weltherrschaft. Ressourcen und Truppen wachsen automatisch (auch offline), du
entscheidest, wann und wo du angreifst.

Komplett clientseitig (kein Server nötig), Spielstand liegt im Browser
(`localStorage`) — perfekt für kostenloses Hosting über GitHub Pages.

## Spielprinzip

- Echte Weltkarte mit ~175 einzelnen Ländern (Geodaten von Natural Earth via
  `world-atlas`/`topojson-client`/`d3-geo`), Nachbarschaft automatisch aus
  echten Landgrenzen abgeleitet (Inselstaaten bekommen automatisch die
  nächstgelegenen Länder als See-Nachbarn, damit niemand uneinnehmbar ist).
  Zum Zoomen/Verschieben: Mausrad bzw. Pinch-Geste, Ziehen zum Verschieben.
- Jedes eigene Land generiert automatisch Gold pro Sekunde — auch während du
  nicht spielst (beim nächsten Laden wird die vergangene Zeit nachgerechnet,
  gedeckelt auf 12 Stunden).
- Truppen werden **nicht gekauft**, sondern in einer **Kaserne ausgebildet**.
  Jedes Startland (deins wie die der KI) hat von Anfang an eine Kaserne Stufe
  1, bildet also sofort Truppen aus (kostet fortlaufend Gold pro
  ausgebildeter Truppe) — höhere Kasernen-Stufen bilden schneller aus *und*
  erhöhen die Truppenkapazität. Eroberst du ein fremdes Land ohne eigene
  Kaserne, musst du dort erst eine bauen, damit es Truppen nachzieht.
  Erobertst du ein fremdes Land mit Kaserne, gehört dir auch diese Kaserne
  (und umgekehrt: verlierst du ein Land, verlierst du die Kaserne dort mit).
- Weitere **Infrastruktur** in einem eigenen Land: Wirtschaft (+25 %
  Gold/Stufe), Festung (+20 % Verteidigung/Stufe), je bis Stufe 3.
- **Land mit der Maus berühren** zeigt sofort ein Tooltip mit Besitzer,
  aktueller Truppenzahl und Einkommen — so siehst du vor einem Angriff genau,
  wie stark das Zielland gerade ist, ohne es erst anklicken zu müssen.
- Klicke ein eigenes Land an, dann ein angrenzendes fremdes Land, um einen
  Angriff vorzubereiten. Das Angriffspanel zeigt eine grobe
  **Erfolgschancen-Einschätzung** (Angriffsstärke vs. Verteidigung) direkt
  neben dem Schieberegler, der bestimmt, wie viel Prozent der stationierten
  Truppen du einsetzt — Vorsicht: Wer sein Grenzland leer räumt, riskiert
  einen sofortigen Gegenangriff der KI.
- Sieg: Du kontrollierst 50 % aller Länder. Niederlage: Du verlierst dein
  letztes Land.
- Fünf KI-Nationen (Frankreich, Russland, China, USA, Arabische Liga) greifen
  eigenständig regelbasiert an: Sie suchen sich das schwächste erreichbare
  Nachbarland und verstärken sonst ihre Grenzländer.

## Lokal starten

Voraussetzung: [Node.js](https://nodejs.org/) (Version 18 oder neuer).

```bash
npm install
npm run dev
```

Der Dev-Server läuft danach z. B. unter `http://localhost:5173`.

Production-Build lokal testen:

```bash
npm run build
npm run preview
```

## Kostenlos auf GitHub Pages hosten

1. Ein neues (oder bestehendes) GitHub-Repository anlegen und dieses Projekt
   hineinpushen (siehe unten).
2. In den Repo-Einstellungen unter **Settings → Pages** bei **Source**
   **"GitHub Actions"** auswählen.
3. Bei jedem Push auf `main` baut der mitgelieferte Workflow
   (`.github/workflows/deploy.yml`) das Spiel automatisch und veröffentlicht
   es unter `https://<dein-github-name>.github.io/<repo-name>/`.

```bash
git init
git add .
git commit -m "Weltherrschaft: erste Version"
git branch -M main
git remote add origin https://github.com/<dein-name>/<repo-name>.git
git push -u origin main
```

Der Workflow setzt den Vite-Base-Path automatisch passend zum Repo-Namen.
Falls du stattdessen eine **User-/Organisations-Seite**
(`<dein-name>.github.io`, Repo heißt genauso) nutzt, entferne die
`VITE_BASE_PATH`-Zeile im Workflow (oder setze sie auf `/`).

## Projektstruktur

```
src/
  game/
    state.ts           Typen + Speicherstand (localStorage, Offline-Fortschritt)
    world.ts            Echte Länder aus TopoJSON, Adjazenz, Start-Nationen
    world-atlas.d.ts    Typdeklaration für den world-atlas JSON-Import
    engine.ts            Ressourcen-Tick, Kampf, Gebäude, KI, Sieg-/Niederlage-Check
  ui/
    map.ts      SVG-Kartenrendering (d3-geo) + Zoom/Pan (d3-zoom) + Klicks
    hud.ts      Ressourcenanzeige, Aktions-/Gebäudepanel, Nationenliste, Overlay
  main.ts       Verbindet Engine + UI, Game-Loop, Speichern/Laden
  style.css
.github/workflows/deploy.yml   Automatisches Deployment nach GitHub Pages
```

Die Spiellogik (`game/`) hat bewusst keinerlei DOM-Zugriff — sie arbeitet nur
mit reinen, serialisierbaren Objekten. Das ist die Grundlage für die geplante
Mehrspieler-Erweiterung (siehe Roadmap).

## Roadmap

Dieses Repo enthält **Phase 1**: eine vollständig spielbare Einzelspieler-
Version. Geplante nächste Schritte:

- **Phase 2 — Ausbau Singleplayer:** mehr Balancing, Technologien/Upgrades,
  bessere KI, Sound- und visuelle Politur, ggf. feinere Kartenauflösung.
- **Phase 3 — Online-Mehrspieler:** gemeinsamer Weltzustand über
  [Firebase Firestore](https://firebase.google.com/docs/firestore) (kostenloser
  Spark-Plan, keine Kreditkarte nötig), einfache Namens-/Anonym-Anmeldung,
  Aktionen als Firestore-Transaktionen, Echtzeit-Sync zwischen Clients.
  GitHub Pages bleibt das Hosting fürs Frontend, Firebase übernimmt nur die
  Datenhaltung.
- **Phase 4 — Optional:** Allianzen, Chat, Ranglisten, Zufallsereignisse.

## Lizenz

Freie Nutzung für dieses persönliche Projekt.
