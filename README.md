# Demokratiepost

**Eine Webseite, die politische Musterschreiben in wenigen Sekunden versandfertig macht.**

Man gibt seine Postleitzahl ein, wählt eine Kampagne – und bekommt fertige Schreiben mit
korrektem Empfänger und den eigenen Absenderdaten, bereit zum Ausdrucken, Kopieren oder
direkt Versenden.

---

## Das Problem

Gutachter Kail veröffentlicht auf YouTube Videos zu Stromnetzen und erneuerbaren Energien.
Zu seinen Videos stellt er **Musterschreiben** bereit, mit denen Bürgerinnen und Bürger sich
bei politischen Akteuren Gehör verschaffen sollen.

Zum Beispiel: <https://www.youtube.com/post/UgkxTjjsGzwaoI8yyszmxAbxtlIDJ3pFjAwl>

Das Problem dabei: Diese Schreiben sind **Rohvorlagen**. Vor dem Versand muss man selbst …

1. den **richtigen Empfänger** für seinen Wohnort herausfinden (mühsame Suche auf
   Behörden- und Abgeordneten-Webseiten),
2. die **Absender- und Empfängerdaten** in die Vorlage eintragen,
3. das Ganze **druckfertig oder als Nachricht** aufbereiten.

Jeder einzelne Schritt kostet Zeit – und genau daran scheitern viele. Die Folge: Die
Schreiben erreichen weniger Menschen, als sie könnten.

## Die Lösung

Diese Webseite nimmt den Bürgerinnen und Bürgern die ganze Arbeit ab:

> **Postleitzahl eingeben → Kampagne wählen → fertigen Brief erhalten.**

Anhand der Postleitzahl werden die zuständigen Empfänger automatisch ermittelt und das
passende Musterschreiben mit den eigenen Daten befüllt. Kein Suchen, kein Formatieren,
kein manuelles Einsetzen mehr.

**Das Ziel:** eine möglichst große Reichweite, indem der Versand so einfach wie möglich wird.

## So funktioniert es

1. **PLZ eingeben** – z. B. `10115`.
2. **Kampagne auswählen** – das Thema, zu dem man schreiben möchte.
3. **Empfänger anzeigen** – die zuständigen Akteure für die eigene PLZ werden aufgelistet.
   (Eine PLZ kann mehrere Zuständige betreffen – dann werden alle angezeigt.)
4. **Schreiben prüfen** – die Vorlage wird automatisch mit Absender- und Empfängerdaten gefüllt.
5. **Versenden** – wahlweise:
   - als **PDF-Brief** zum Ausdrucken und per Post verschicken (an das Wahlkreisbüro),
   - über das **Kontaktformular** des Abgeordneten, oder
   - als **Text zum Kopieren**.

## Empfänger und Kampagnen

Je nach Thema können unterschiedliche Akteure angeschrieben werden. Mögliche Empfänger sind:

- Bundestagsabgeordnete
- Landtagsabgeordnete
- Landrat
- Bürgermeister
- Stadtwerke
- Netzbetreiber

Verschiedene Themen werden als **Kampagne** zusammengefasst. Jede Kampagne bringt ihre eigenen
Musterschreiben für die jeweiligen Empfänger mit.

## Datenschutz

Die Anwendung läuft **komplett im Browser**. Es gibt kein Backend und kein Tracking.
Postleitzahl und Absenderdaten verlassen das Gerät nicht – gespeicherte Eingaben liegen nur
lokal im Browser. Einen Überblick gibt der Abschnitt **„Datenspeicherung"** auf der Seite
selbst, inklusive Schaltfläche zum Löschen der gespeicherten Daten.

## Entwicklung

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install     # Abhängigkeiten installieren
npm run dev     # lokaler Entwicklungsserver
npm run build   # Produktions-Build nach dist/
npm run preview # Build lokal testen
```

Die Seite wird über GitHub Actions automatisch nach GitHub Pages deployt
(`.github/workflows/deploy.yml`). Wichtig: In `vite.config.ts` muss `base` dem
Repo-Namen entsprechen (`/demokratiepost/`).

### Dev-Container (VS Code)

Für eine gekapselte Umgebung (Node + OpenCode + Chromium) gibt es einen Dev-Container
unter `.devcontainer/`. In VS Code: **Dev Containers: Reopen in Container**. OpenCode
läuft dann im Container und ist vom Host-System isoliert. Details:
[`.devcontainer/README.md`](./.devcontainer/README.md).

### Kampagnen anlegen

Kampagnen liegen als Dateien im Repo und werden zur Build-Zeit eingelesen:

```
campaigns/<kampagne>/
├── campaign.yaml        # id, title, theme, description, recipients
└── templates/<typ>.md   # Markdown-Template je Empfängertyp (z. B. mdb.md)
```

Im Template werden Platzhalter in Punktnotation verwendet, z. B. `{{ absender.name }}`
oder `{{ empfaenger.wahlkreis }}`. Sie werden automatisch mit den passenden Werten gefüllt.

### Empfängerdaten

Die Empfänger (Bundestagsabgeordnete) und die Zuordnung `PLZ → Wahlkreis` liegen als
JSON unter `public/data/`. Die **Abgeordneten-Daten sind echt** und werden aus den Profilen
auf bundestag.de gelesen (Name, Fraktion, Wahlkreis, Wahlkreisbüro-Anschrift,
Kontaktformular-Link). E-Mail-Adressen veröffentlicht der Bundestag nicht – die App bietet
deshalb den Kontaktformular-Link an. Beim Öffnen wird der Brieftext automatisch in die
Zwischenablage kopiert; zusätzlich zeigt die App die Formularfelder vorausgefüllt mit
eigenem Kopier-Button pro Feld (das Formular selbst lässt sich nicht vorbelegen). Die
**PLZ-Zuordnung ist noch Demo**. Wie die Daten
erzeugt werden, steht in [`scripts/README.md`](./scripts/README.md).

## Projektstatus

Der Prototyp beginnt bewusst klein:

- **MVP:** Postleitzahl → Bundestagsabgeordnete → fertiger Brief (PDF oder Kontaktformular).
- Danach: Landtagsabgeordnete, kommunale Ebene (Bürgermeister/Landrat) und später
  Netzbetreiber/Stadtwerke.

Der vollständige technische Plan, die Datenquellen und die Meilensteine stehen in
[`PLAN.md`](./PLAN.md).
