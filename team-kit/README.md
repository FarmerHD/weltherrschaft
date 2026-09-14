# Agenten-Team (generische Fassung)

Vier zusammenarbeitende Subagents und der `/team`-Loop, ohne Bezug auf ein
bestimmtes Projekt — gedacht zum globalen Installieren.

| Rolle | Aufgabe |
|---|---|
| `pm` | Schneidet Akzeptanzkriterien, prueft fertige Arbeit gegen den Diff, gibt `APPROVE` oder `REJECT` |
| `design` | Design-Spezifikation mit konkreten Werten, danach Audit der Umsetzung |
| `frontend` | Oberflaeche: Markup, Styles, Komponenten |
| `backend` | Logik, Datenmodell, Persistenz |

Der `/team`-Loop laeuft ohne Rundenlimit, bis `pm` abnimmt.

## Global installieren (eigener Rechner)

```bash
bash team-kit/install.sh
```

Kopiert die Dateien nach `~/.claude/agents/` und `~/.claude/skills/team/`.
Danach steht `/team` in **jedem** Projekt zur Verfuegung.

## Nur fuer ein einzelnes Projekt

Dieselben Dateien nach `<projekt>/.claude/agents/` und
`<projekt>/.claude/skills/team/` kopieren. Projektfassungen duerfen
konkrete Pfade und Build-Kommandos nennen — das macht sie praeziser.
