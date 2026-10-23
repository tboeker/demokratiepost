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

echo
echo "==> Fertig."
echo "    OpenCode starten:   opencode"
echo "    Dev-Server starten: npm run dev   (Port 5173)"
echo "    Datenschutz-Hinweis: Der Workspace ist ins Host-System gemountet –"
echo "    OpenCode kann ihn (und nur ihn) verändern."
