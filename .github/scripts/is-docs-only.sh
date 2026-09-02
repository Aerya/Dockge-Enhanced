#!/usr/bin/env bash
set -euo pipefail

BASE_SHA="${1:-}"
HEAD_SHA="${2:-}"

[[ -n "$BASE_SHA" && -n "$HEAD_SHA" ]] || exit 2

mapfile -t changed < <(git diff --name-only "$BASE_SHA" "$HEAD_SHA")
[[ "${#changed[@]}" -gt 0 ]] || exit 1

for file in "${changed[@]}"; do
    case "$file" in
        README*.md|CHANGELOG*.md|*.md|docs/*|docs/**|screens/*|screens/**)
            ;;
        *)
            exit 1
            ;;
    esac
done

exit 0
