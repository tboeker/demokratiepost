# Sandbox-Image für Node + OpenCode (VS Code Dev Container).
ARG NODE_VERSION=22
FROM mcr.microsoft.com/devcontainers/typescript-node:${NODE_VERSION}-bookworm

# Headless-Chromium (für den bundestag.de-Scraper und E2E-Tests) plus Kleinkram.
RUN apt-get update \
 && export DEBIAN_FRONTEND=noninteractive \
 && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      ripgrep \
      jq \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# Verzeichnisse für die persistenten OpenCode-Volumes anlegen und dem Nutzer `node`
# geben, damit benannte Volumes mit den passenden Rechten initialisiert werden.
RUN mkdir -p \
      /home/node/.config/opencode \
      /home/node/.local/share/opencode \
      /home/node/.opencode \
 && chown -R node:node /home/node/.config /home/node/.local /home/node/.opencode

ENV CHROME_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=1
