# Dev-Container (VS Code)

Node-Entwicklungsumgebung für **Meine Beschwerde**, in der **OpenCode** gekapselt im
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
5. **Optional: Netzwerk-Allowlist** – `init-firewall.sh` begrenzt ausgehende Verbindungen
   auf eine Liste (OpenCode-Provider, GitHub, npm, bundestag.de). Siehe unten.

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
