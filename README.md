# 🌍 Weltherrschaft

Ein Idle-/Risk-Strategiespiel für den Browser: Du führst dein Reich an, erorberst
angrenzende Regionen und ringst mit fünf computergesteuerten Großmächten um die
Weltherrschaft. Ressourcen und Truppen wachsen automatisch (auch offline), du
entscheidest, wann und wo du angreifst.

Komplett clientseitig (kein Server nötig), Spielstand liegt im Browser
(`localStorage`) — perfekt für kostenloses Hosting über GitHub Pages.

## Spielprinzip

- Die Karte besteht aus 44 stilisierten Weltregionen (Kontinent-Ebene, kein
  exaktes Grenzmodell — eher wie beim Brettspiel Risk).
- Jede eigene Region generiert automatisch Gold pro Sekunde und regeneriert
  passiv Truppen bis zu ihrer Kapazität — auch während du nicht spielst
  (beim nächsten Laden wird die vergangene Zeit nachgerechnet, gedeckelt auf
  12 Stunden).
- Mit Gold kaufst du zusätzliche Truppen in einer Region.
- Klicke eine eigene Region an, dann eine angrenzende fremde Region, um einen
  Angriff vorzubereiten. Der Schieberegler bestimmt, wie viel Prozent der
  stationierten Truppen du einsetzt — Vorsicht: Wer sein Grenzgebiet leer
  räumt, riskiert einen sofortigen Gegenangriff der KI.
- Sieg: Du kontrollierst 60 % der Weltkarte. Niederlage: Du verlierst deine
  letzte Region.
- Fünf KI-Nationen (Frankreich, Russland, China, USA, Arabische Liga) greifen
  eigenständig regelbasiert an: Sie suchen sich das schwächste erreichbare
  Nachbargebiet und verstärken sonst ihre Grenzregionen.

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
    state.ts    Typen + Speicherstand (localStorage, Offline-Fortschritt)
    world.ts    Weltkarte: Regionen, Nachbarschaften, Start-Nationen
    engine.ts   Spiellogik: Ressourcen-Tick, Kampf, KI, Sieg-/Niederlage-Check
  ui/
    map.ts      SVG-Kartenrendering + Klick-Interaktion
    hud.ts      Ressourcenanzeige, Aktionspanel, Nationenliste, Overlay
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
