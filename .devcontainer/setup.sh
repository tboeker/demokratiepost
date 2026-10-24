#!/usr/bin/env bash
# Läuft einmalig nach dem Erstellen des Containers (postCreateCommand).
set -euo pipefail

echo "==> OpenCode CLI installieren"
if command -v opencode >/dev/null 2>&1; then
  echo "    bereits vorhanden: $(command -v opencode)"
else
  curl -fsSL https://opencode.ai/v2/install | bash
fi

echo "==> Projekt-Abhängigkeiten installieren"
npm ci

echo "==> Push-Schutz einrichten (Git-Config + pre-push-Hook)"
mkdir -p "$HOME/.config/git"
# Symlinks statt Kopien: Änderungen im Repo gelten sofort im Container.
ln -sfn "$PWD/.devcontainer/gitconfig-sandbox" "$HOME/.config/git/sandbox.gitconfig"
ln -sfn "$PWD/.devcontainer/git-hooks" "$HOME/.config/git/hooks"
chmod +x "$PWD/.devcontainer/git-hooks/"* 2>/dev/null || true

echo
echo "==> Fertig."
echo "    OpenCode starten:   opencode"
echo "    Dev-Server starten: npm run dev   (Port 5173)"
echo "    Datenschutz-Hinweis: Der Workspace ist ins Host-System gemountet –"
echo "    OpenCode kann ihn (und nur ihn) verändern."
echo "    Push-Hinweis: git push ist im Container gesperrt – bitte auf dem Host pushen."
