# Dev-Container (VS Code)

Node-Entwicklungsumgebung für **Demokratiepost**, in der **OpenCode** gekapselt im
Container läuft. Der Container ist die Sandbox: OpenCode kann nur den gemounteten
Workspace und den Container selbst verändern – nicht das Host-System.

## Voraussetzungen

- VS Code mit der Erweiterung **Dev Containers** (`ms-vscode-remote.remote-containers`)
- Docker oder Podman auf dem Host

### Podman statt Docker

Podman funktioniert, muss VS Code aber bekannt gemacht werden, z. B.:

```jsonc
// settings.json
"dev.containers.dockerPath": "podman"
```

## Starten

1. Repo in VS Code öffnen.
2. `Strg+Shift+P` → **Dev Containers: Reopen in Container**.
3. Der Container wird gebaut; `postCreateCommand` installiert OpenCode und die
   npm-Abhängigkeiten.

## Was drin ist

| Baustein | Zweck |
|---|---|
| Node 22 + npm | Projekt (Vite/React/TypeScript) |
| `@opencode/cli` | OpenCode-Agent, im Container ausgeführt |
| Chromium | `scripts/fetch-bundestag.mjs` und E2E-Tests (`puppeteer-core`) |
| git, GitHub CLI, ripgrep, jq | Werkzeuge |
| VS-Code-Extension `sst-dev.opencode` | OpenCode-Integration im Editor |

## Nutzung

```bash
opencode           # OpenCode starten (oder Ctrl+Esc in VS Code)
npm run dev        # Dev-Server auf Port 5173 (wird weitergeleitet)
npm run build      # Produktions-Build
npm run preview    # Build lokal testen (Port 4173)
```

Die Ports 5173 und 4173 werden automatisch nach VS Code weitergeleitet.

## Sandboxing

Mehrere Ebenen:

1. **Container-Isolation** – OpenCode und alle Befehle laufen im Container. Das
   Host-Dateisystem ist nicht sichtbar; nur der Workspace ist hineingemountet.
2. **Nicht-privilegierter Nutzer** – der Container läuft als `node`, nicht als root.
3. **`no-new-privileges`** – verhindert Rechteausweitung über setuid.
4. **OpenCode-Policies/Permissions** – zusätzlich lassen sich auf Agentenebene Regeln
   definieren (`permissions`, `policies` in `opencode.jsonc`), z. B. `git push` verbieten
   oder Shell-Befehle bestätigen lassen.
5. **Kein Push aus dem Container** – Commits ja, Publish nein (per Flag
   `DEVCONTAINER_ALLOW_PUSH` freischaltbar). Siehe
   [Push im Container](#push-im-container).
6. **Optional: Netzwerk-Allowlist** – `init-firewall.sh` begrenzt ausgehende Verbindungen
   auf eine Liste (OpenCode-Provider, GitHub, npm, bundestag.de). Siehe unten.

### Push im Container

**Warum der Container pushen konnte:** Der Container hat nie eigene Zugangsdaten
gespeichert – VS Code hat sie durchgereicht. Die Dev-Containers-Erweiterung schreibt
beim Start einen Credential-Helper nach `/etc/gitconfig` und `~/.gitconfig`, der über
einen IPC-Socket die GitHub-Anmeldung des **Hosts** abfragt. Zusätzlich werden
`GIT_ASKPASS`/`VSCODE_GIT_ASKPASS_*` und `SSH_AUTH_SOCK` in den Container geforwardet.
Ein `git push` im Container war damit effektiv ein Push mit deinen Host-Rechten.

**Was jetzt gilt:**

- `GIT_CONFIG_GLOBAL` zeigt auf `~/.config/git/gitconfig`, das `setup.sh` je nach Flag
  verlinkt: standardmäßig auf `.devcontainer/gitconfig-sandbox` (per Symlink nach
  `~/.config/git/sandbox.gitconfig`). Diese Konfiguration leert die Helferliste
  (`credential.helper =`), setzt `askPass = /bin/false`, `push.default = nothing` und
  deaktiviert den SSH-Agent (`core.sshCommand`).
- `.devcontainer/git-hooks/pre-push` bricht jeden `git push` mit einer Erklärung ab
  (`core.hooksPath`), auch wenn doch irgendwo ein Token auftauchen sollte.
- `opencode.json` verbietet dem Agenten `git push` zusätzlich auf Permission-Ebene.

Push läuft damit **nur auf dem Host** (VS Code ohne Container oder Terminal):

```bash
git add -A && git commit -m "…"   # im Container okay
# Push dann auf dem Host:
git push
```

#### Push per Flag freischalten

Der Push-Schutz ist über das Flag `DEVCONTAINER_ALLOW_PUSH` schaltbar:

- `0` (Standard): Push im Container gesperrt – wie oben beschrieben.
- `1`: Push im Container erlaubt. `setup.sh` verlinkt dann `~/.config/git/gitconfig`
  auf die normale `~/.gitconfig`, sodass der von VS Code eingetragene
  Credential-Helper greift; der `pre-push`-Hook lässt ebenfalls durch.

Umschalten ohne Änderung im Repo (empfohlen): Host-Variable setzen und den Container
neu erstellen (`Dev Containers: Rebuild Container`).

```bash
DEVCONTAINER_ALLOW_PUSH=1 code .        # Host: VS Code mit gesetztem Flag starten
```

Alternativ in `devcontainer.json` den Standardwert ändern:

```jsonc
"DEVCONTAINER_ALLOW_PUSH": "${localEnv:DEVCONTAINER_ALLOW_PUSH:1}"
```

Ohne Neubau (nur zum Ausprobieren) reicht im Container:

```bash
DEVCONTAINER_ALLOW_PUSH=1 bash .devcontainer/setup.sh   # schaltet auf „erlaubt"
DEVCONTAINER_ALLOW_PUSH=0 bash .devcontainer/setup.sh   # wieder sperren
```

`setup.sh` verlinkt dabei nur die Git-Konfiguration um; ein Neustart ist nicht nötig.
Ein Neubau ist trotzdem empfehlenswert, damit `DEVCONTAINER_ALLOW_PUSH` auch für
weitere Shells und den `pre-push`-Hook konsistent gesetzt ist.

Hinweis: `DEVCONTAINER_ALLOW_PUSH=1` hebt nur die Container-Sperre auf. Die
Agenten-Permission in `opencode.json` (`git push` = `deny`) bleibt bestehen – wer
dem Agenten Push erlauben will, muss diese Regel separat anpassen.

Bewusst in Kauf genommen: `git fetch`/`pull` funktionieren im gesperrten Modus nur für
öffentliche Repos (ohne Zugangsdaten). Und wer die Sperre wirklich umgehen will, kann
`GIT_CONFIG_GLOBAL` überschreiben – es ist eine Leitplanke, keine Festung.

### Netzwerk begrenzen (optional)

`init-firewall.sh` ist standardmäßig inaktiv. Aktivierung:

1. In `devcontainer.json` bei `runArgs` `"--cap-add=NET_ADMIN"` ergänzen und
   `"--security-opt=no-new-privileges"` entfernen (sonst funktioniert `sudo` nicht).
2. Im Container: `sudo bash .devcontainer/init-firewall.sh`

Bei einem anderen Modell-Provider dessen Domain in `ALLOWED_DOMAINS` ergänzen.

## Persistenz

Login, Sessions und Konfiguration von OpenCode liegen in benannten Volumes
(`opencode-config`, `opencode-data`) und überleben einen Container-Neubau. Die
Projekt-Abhängigkeiten (`node_modules`) liegen im Workspace.

## Entfernen

Container und Volumes verwerfen:

```bash
docker rm -f <container>
docker volume rm opencode-config opencode-data
```
