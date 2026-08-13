# Sécurité

## Signaler une vulnérabilité

Utilisez le bouton **Report a vulnerability** de l’onglet Security du dépôt. Ne publiez pas de preuve de concept exploitable dans une issue publique.

## Maintenance automatique

Le dépôt applique quotidiennement les corrections de dépendances non destructives et suit la branche `master` de Dockge. Chaque mise à jour passe par une pull request et ne peut être fusionnée qu’après l’audit npm, TypeScript, les tests d’authentification, le build frontend, CodeQL, Trivy et les builds puis scans Docker amd64/arm64.

Les conflits upstream arrêtent la synchronisation et créent une issue : aucune résolution automatique ne choisit arbitrairement la version Enhanced ou upstream.

Les images ne sont publiées qu’après un scan sans vulnérabilité HIGH ou CRITICAL disposant d’un correctif.

## Exception connue

Dockge doit accéder au socket Docker de l’hôte pour administrer les stacks. L’image n’impose donc pas un utilisateur non-root statique : le GID du socket varie selon l’hôte et ce changement casserait certains déploiements. Pour réduire le risque, n’exposez pas Dockge directement à Internet ; limitez son accès au LAN ou à un VPN et conservez l’authentification active.
