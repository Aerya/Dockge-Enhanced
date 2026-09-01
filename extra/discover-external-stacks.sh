#!/usr/bin/env bash
set -euo pipefail

# Read-only helper for the experimental external-stacks feature. Run it on the
# Docker host, never inside Dockge-Enhanced.
command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

mapfile -t ids < <(docker ps -aq)
if (( ${#ids[@]} == 0 )); then
    echo "No Docker container found."
    exit 0
fi

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
docker inspect "${ids[@]}" > "$tmp"

mapfile -t projects < <(jq -r '.[].Config.Labels["com.docker.compose.project"]? // empty' "$tmp" | sort -u)
mapfile -t compose_paths < <(jq -r '.[].Config.Labels["com.docker.compose.project.config_files"]? // empty' "$tmp" | tr ',' '\n' | awk '/^\// { print }' | sort -u)
mapfile -t data_paths < <(jq -r '.[].Mounts[]? | select(.Type == "bind") | .Source // empty' "$tmp" | sort -u)

echo "${#projects[@]} projets Docker détectés, ${#compose_paths[@]} fichiers Compose, ${#data_paths[@]} chemins bind distincts."
echo

declare -A candidates=()
for candidate in "${compose_paths[@]}"; do
    dir=$(dirname "$candidate")
    # Prefer a sensible parent such as /home/user/docker or /var/www.
    case "$dir" in
        /home/*/docker/*) root=$(dirname "$(dirname "$dir")")/docker ;;
        /srv/*/*) root=$(dirname "$dir") ;;
        /var/www/*) root=/var/www ;;
        *) root=$(dirname "$dir") ;;
    esac
    [[ "$root" != "/" ]] && candidates["$root"]=1
done
for candidate in "${data_paths[@]}"; do
    case "$candidate" in /mnt/*|*/media*|*/download*|*/torrent*) candidates["$candidate"]=0 ;; esac
done

selected=()
echo "Chemins proposés (aucun chemin n'est monté ni autorisé automatiquement) :"
for root in "${!candidates[@]}"; do
    default=${candidates[$root]}
    marker=" "
    [[ "$default" == 1 ]] && marker="✓"
    printf '[%s] %s' "$marker" "$root"
    if [[ "$default" == 1 ]]; then
        read -r -p '  Garder ? [Y/n] ' answer
        [[ ! "$answer" =~ ^[Nn]$ ]] && selected+=("$root")
    else
        read -r -p '  Inclure ? [y/N] ' answer
        [[ "$answer" =~ ^[Yy]$ ]] && selected+=("$root")
    fi
done

if (( ${#selected[@]} == 0 )); then
    echo "Aucune racine sélectionnée. Rien n'a été modifié."
    exit 0
fi

joined=$(IFS=,; echo "${selected[*]}")
echo
echo "Ajoutez les bind mounts en lecture-écriture uniquement pour les racines que vous avez choisies :"
for root in "${selected[@]}"; do echo "  - ${root}:${root}"; done
echo
echo "Puis ajoutez :"
echo "  DOCKGE_EXTERNAL_STACKS_ALLOWED_PATHS=${joined}"
echo
echo "Le script n'a modifié aucun fichier, conteneur, volume ou projet Docker."
