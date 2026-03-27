#!/bin/bash
# ═══════════════════════════════════════════════════
# sync-upstream.sh — Merge les mises à jour de Dockge
# ═══════════════════════════════════════════════════
#
# Usage :
#   ./sync-upstream.sh           (merge la dernière version)
#   ./sync-upstream.sh v1.5.1    (merge un tag spécifique)

set -e

UPSTREAM_REMOTE="upstream"
UPSTREAM_REPO="https://github.com/louislam/dockge.git"
TARGET_BRANCH="main"

# Vérifie que le remote upstream existe, sinon l'ajoute
if ! git remote | grep -q "^${UPSTREAM_REMOTE}$"; then
    echo "➕ Ajout du remote upstream..."
    git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_REPO"
fi

echo "📥 Récupération des dernières versions upstream..."
git fetch "$UPSTREAM_REMOTE" --tags

# Détermine la cible (argument ou dernier tag)
if [ -n "$1" ]; then
    TAG="$1"
else
    TAG=$(git tag -l --sort=-v:refname | head -n1)
    if [ -z "$TAG" ]; then
        echo "❌ Aucun tag trouvé. Spécifie un tag : ./sync-upstream.sh v1.5.1"
        exit 1
    fi
fi

CURRENT_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "inconnu")
echo ""
echo "📌 Version actuelle : $CURRENT_TAG"
echo "🎯 Version cible    : $TAG"
echo ""

# Vérifie qu'on est sur la bonne branche
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "$TARGET_BRANCH" ]; then
    echo "⚠️  Tu n'es pas sur '$TARGET_BRANCH' (actuel: $CURRENT_BRANCH)"
    echo "    Fais : git checkout $TARGET_BRANCH"
    exit 1
fi

# Merge
echo "🔀 Merge de $TAG dans $TARGET_BRANCH..."
echo "   Si des conflits apparaissent, résous-les puis :"
echo "     git add ."
echo "     git commit"
echo ""

git merge "$TAG" --no-edit || {
    echo ""
    echo "⚠️  CONFLITS DÉTECTÉS — c'est normal !"
    echo ""
    echo "   Les fichiers en conflit sont probablement ceux qu'on a modifiés :"
    echo "   - backend/dockge-server.ts"
    echo "   - frontend/src/layouts/Layout.vue"
    echo "   - frontend/src/router.ts"
    echo "   - frontend/src/icon.ts"
    echo "   - package.json"
    echo ""
    echo "   Pour chaque fichier en conflit :"
    echo "     1. Ouvre-le et garde NOS modifications (Enhanced)"
    echo "     2. Intègre les changements upstream s'ils sont pertinents"
    echo "     3. git add <fichier>"
    echo ""
    echo "   Quand tout est résolu : git commit"
    exit 1
}

echo ""
echo "✅ Merge réussi ! Prochaines étapes :"
echo "   1. Vérifie les changements (git diff HEAD~1)"
echo "   2. git push origin $TARGET_BRANCH"
echo "   3. GitHub Actions rebuild et publie l'image automatiquement"
