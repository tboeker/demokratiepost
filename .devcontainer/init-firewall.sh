#!/usr/bin/env bash
# OPTIONAL: ausgehenden Netzwerkverkehr des Containers auf eine Allowlist begrenzen.
#
# Standardmäßig NICHT aktiv. Zum Aktivieren:
#   1. In devcontainer.json bei "runArgs" ergänzen:
#        "--cap-add=NET_ADMIN"
#      (und die Zeile "--security-opt=no-new-privileges" entfernen, damit `sudo` funktioniert)
#   2. Im Container ausführen:  sudo bash .devcontainer/init-firewall.sh
#
# Achtung: IP-Adressen werden beim Ausführen aufgelöst. Ändern sie sich (z. B. durch
# CDN-Wechsel), das Skript einfach erneut ausführen. Bei einem anderen Modell-Provider
# dessen Domain unten in ALLOWED_DOMAINS ergänzen, sonst ist OpenCode offline.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Bitte als root ausführen: sudo bash .devcontainer/init-firewall.sh" >&2
  exit 1
fi

# Erlaubte Domains. Bei anderem Provider (z. B. anthropic.com) erweitern!
ALLOWED_DOMAINS=(
  "opencode.ai"
  "api.opencode.ai"
  "openrouter.ai"
  "github.com"
  "api.github.com"
  "codeload.github.com"
  "objects.githubusercontent.com"
  "raw.githubusercontent.com"
  "registry.npmjs.org"
  "bundestag.de"
  "www.bundestag.de"
)

DNS_SERVERS=$(awk '/^nameserver/ {print $2}' /etc/resolv.conf | tr '\n' ' ')

echo "Setze Firewall-Regeln …"
iptables -F
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# Loopback erlauben (OpenCode-CLI spricht lokal mit dem Hintergrunddienst).
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Bestehende Verbindungen erlauben.
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# DNS erlauben.
for ns in $DNS_SERVERS; do
  iptables -A OUTPUT -p udp -d "$ns" --dport 53 -j ACCEPT
  iptables -A OUTPUT -p tcp -d "$ns" --dport 53 -j ACCEPT
done

# Allowlist auflösen und HTTP/HTTPS erlauben.
for domain in "${ALLOWED_DOMAINS[@]}"; do
  for ip in $(getent ahostsv4 "$domain" | awk '{print $1}' | sort -u); do
    iptables -A OUTPUT -p tcp -d "$ip" --dport 443 -j ACCEPT
    iptables -A OUTPUT -p tcp -d "$ip" --dport 80 -j ACCEPT
  done
done

echo "Fertig. Ausgehend erlaubt sind nur: ${ALLOWED_DOMAINS[*]}"
