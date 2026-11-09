#!/usr/bin/env bash
set -euo pipefail

[[ $# == 2 && -n "$1" && -n "$2" ]] || exit 2
# Fail closed if the revisions cannot be compared.
files=$(git diff --name-only "$1" "$2") || exit 2
[[ -n "$files" ]] || exit 1
while IFS= read -r file; do
    case "$file" in
        *.md|docs/*|screens/*|.github/scripts/usage-count.cjs|.github/scripts/usage-count.test.cjs|.github/workflows/usage-count-asset.yml) ;;
        *) exit 1 ;;
    esac
done <<< "$files"
