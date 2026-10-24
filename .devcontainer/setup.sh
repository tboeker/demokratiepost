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

echo "==> Git-Konfiguration einrichten"
ALLOW_PUSH="${DEVCONTAINER_ALLOW_PUSH:-0}"
mkdir -p "$HOME/.config/git"
# Symlinks statt Kopien: Änderungen im Repo gelten sofort im Container.
ln -sfn "$PWD/.devcontainer/gitconfig-sandbox" "$HOME/.config/git/sandbox.gitconfig"
chmod +x "$PWD/.devcontainer/git-hooks/"* 2>/dev/null || true

if [ "$ALLOW_PUSH" = "1" ]; then
  # Push erlaubt: normale Git-Konfiguration (~/.gitconfig) nutzen. Dort trägt
  # VS Code beim Start den Credential-Helper ein, der die Host-Anmeldung nutzt.
  touch "$HOME/.gitconfig"
  ln -sfn "$HOME/.gitconfig" "$HOME/.config/git/gitconfig"
else
  # Push gesperrt: Sandbox-Konfiguration ohne Credential-Helper plus pre-push-Hook.
  ln -sfn "$HOME/.config/git/sandbox.gitconfig" "$HOME/.config/git/gitconfig"
  ln -sfn "$PWD/.devcontainer/git-hooks" "$HOME/.config/git/hooks"
fi

echo
echo "==> Fertig."
echo "    OpenCode starten:   opencode"
echo "    Dev-Server starten: npm run dev   (Port 5173)"
echo "    Datenschutz-Hinweis: Der Workspace ist ins Host-System gemountet –"
echo "    OpenCode kann ihn (und nur ihn) verändern."
if [ "$ALLOW_PUSH" = "1" ]; then
  echo "    Push-Hinweis: git push ist im Container ERLAUBT (Flag DEVCONTAINER_ALLOW_PUSH=1)."
else
  echo "    Push-Hinweis: git push ist im Container gesperrt – bitte auf dem Host pushen."
fi
