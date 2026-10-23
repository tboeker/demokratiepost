# Datenpipeline

Die Anwendung lädt zur Laufzeit zwei Arten von Daten aus `public/data/`:

| Datei | Inhalt |
|---|---|
| `public/data/mdb.json` | Liste der Bundestagsabgeordneten (Empfänger) |
| `public/data/plz/<prefix>.json` | Zuordnung `PLZ -> [Wahlkreis-Nummern]`, aufgeteilt nach den ersten zwei PLZ-Ziffern |

Aktuell liegen **Demo-Daten** im Repo (fiktive Namen), damit der Ablauf testbar ist.
Die folgenden Skripte erzeugen echte Daten.

## 1. Abgeordnete holen (`fetch-mdb.ts`)

Quelle ist die öffentliche API von [abgeordnetenwatch.de](https://www.abgeordnetenwatch.de/api).

```bash
ABGEORDNETENWATCH_API_KEY=dein_key node --experimental-strip-types scripts/fetch-mdb.ts
```

Ergebnis: `public/data/mdb.json`.

> Die API-Feldnamen können sich ändern. Bei Fehlern die Antwort einmal mit einer
> kleinen `range` prüfen und das Mapping im Skript anpassen.

## 2. PLZ → Wahlkreis (`build-plz-index.ts`)

Das Skript wandelt eine CSV-Quelle in die Laufzeit-Shards um:

```bash
node --experimental-strip-types scripts/build-plz-index.ts
# oder mit eigener Quelle:
PLZ_SOURCE=/pfad/plz-wahlkreis.csv node --experimental-strip-types scripts/build-plz-index.ts
```

CSV-Format (Kopfzeile optional):

```csv
plz,wk
10115,74
10117,74
```

Ergebnis: `public/data/plz/<prefix>.json`.

### Woher kommt die CSV?

PLZ und Bundestagswahlkreis sind **nicht** 1:1 – eine PLZ kann mehrere Wahlkreise
umfassen. Die CSV wird deshalb aus zwei Quellen zusammengeführt:

1. **PLZ → Gemeinde** (Amtlicher Gemeindeschlüssel): z. B. über OpenStreetMap-Grenzen
   oder das Gemeindeverzeichnis (Destatis).
2. **Gemeinde → Wahlkreis**: Wahlkreiseinteilung der Bundeswahlleiterin.

Daraus ergibt sich je PLZ die Menge der möglichen Wahlkreise. Diese Vorarbeit ist der
eigentliche Aufwand der Pipeline; das Skript hier übernimmt nur den letzten Schritt
(CSV → Shards).

## Demo-Daten regenerieren

`scripts/source/plz-wahlkreis.csv` enthält die Demo-Zuordnungen. Damit lassen sich die
Shards jederzeit neu erzeugen:

```bash
node --experimental-strip-types scripts/build-plz-index.ts
```
