#!/usr/bin/env bash
# Scénarios de démonstration à lancer pendant que l'interface est ouverte.
# Usage : ./lab/scenarios.sh panne | retour | latence | normal | reboot
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  panne)
    echo "→ Coupure du routeur de l'agence (alerte critique après 2 cycles)"
    docker compose stop sim-routeur-agence ;;
  retour)
    echo "→ Retour du routeur de l'agence (alerte résolue + événement redémarrage)"
    docker compose start sim-routeur-agence ;;
  latence)
    echo "→ +150 ms de latence sur SRV-WEB (seuil 50 ms → état dégradé)"
    docker compose exec -u root sim-serveur-web sh -c "apk add -q iproute2 && tc qdisc replace dev eth0 root netem delay 150ms" ;;
  normal)
    echo "→ Suppression de la latence ajoutée"
    docker compose exec -u root sim-serveur-web sh -c "tc qdisc del dev eth0 root" || true ;;
  reboot)
    echo "→ Redémarrage du switch de cœur (uptime remis à zéro → alerte info)"
    docker compose restart sim-switch-core ;;
  *)
    echo "Usage : $0 panne | retour | latence | normal | reboot"; exit 1 ;;
esac
