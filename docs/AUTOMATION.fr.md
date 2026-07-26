# API REST, webhooks et automatisation

Les fonctions de cette page sont facultatives. Elles ne créent aucun jeton ni webhook tant qu’un administrateur ne le demande dans **Paramètres → Automatisation**.

## Principes de sécurité

- Un secret n’est affiché qu’une fois. Dockge Enhanced ne conserve que son hash SHA-256.
- Chaque jeton limite séparément les permissions, les stacks autorisées et, si souhaité, sa date d’expiration.
- Chaque webhook cible une seule stack et une liste fermée d’actions. Il peut être désactivé ou renouvelé à tout moment.
- L’API est limitée à 60 requêtes par minute et les webhooks à une valeur configurable de 1 à 60.
- Les réponses de l’API de stack ne contiennent ni `compose.yaml`, ni `.env`, ni note.
- Toutes les actions sont journalisées dans l’audit avec l’origine, l’acteur, la durée et une sortie bornée.

Conserve les jetons et URL de webhook dans un gestionnaire de secrets. Protège `/api/*` avec HTTPS et ne place jamais un secret dans un dépôt, un log ou une capture d’écran.

## API REST

Un jeton accepte `Authorization: Bearer <TOKEN>` ou `X-API-Key: <TOKEN>`.

```bash
export DOCKGE_URL="https://dockge.example.com"
export DOCKGE_TOKEN="dge_..."

curl -fsS \
  -H "Authorization: Bearer ${DOCKGE_TOKEN}" \
  "${DOCKGE_URL}/api/v1/stacks"
```

| Méthode | Endpoint | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/stacks` | `stack:read` |
| `GET` | `/api/v1/stacks/:name` | `stack:read` |
| `POST` | `/api/v1/stacks/:name/actions/:action` | `stack:<action>` |
| `GET` | `/api/v1/history?stack=:name&limit=100&offset=0` | `history:read` |

Actions disponibles : `start`, `stop`, `restart`, `update`, `recreate`, `pull-recreate`, `build-recreate` et `backup`.

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer ${DOCKGE_TOKEN}" \
  "${DOCKGE_URL}/api/v1/stacks/immich/actions/restart"
```

`build-recreate` refuse les stacks sans directive Compose `build`. `backup` crée une sauvegarde limitée aux fichiers Compose, `.env` et métadonnées de la stack, via les destinations déjà configurées dans Dockge Enhanced.

## Webhooks

L’interface fournit l’URL complète après création ou renouvellement :

```text
POST https://dockge.example.com/api/webhooks/dwh_<id>_<secret>/<action>
```

Le secret dans l’URL authentifie l’appel. Aucun header supplémentaire n’est requis.

```bash
curl -fsS -X POST \
  "https://dockge.example.com/api/webhooks/dwh_1_SECRET/restart"
```

Une URL renouvelée invalide immédiatement l’ancienne. Un webhook désactivé, expiré, hors limite ou appelé avec une action non autorisée renvoie respectivement une erreur d’authentification, de limite ou d’autorisation.

## Home Assistant

Exemple avec un webhook limité à `start`, `stop` et `restart` pour la stack `immich` :

```yaml
rest_command:
  dockge_immich_restart:
    url: !secret dockge_immich_restart_webhook
    method: POST
    timeout: 120
```

Dans `secrets.yaml` :

```yaml
dockge_immich_restart_webhook: "https://dockge.example.com/api/webhooks/dwh_1_SECRET/restart"
```

Exemple de bouton :

```yaml
button:
  - platform: template
    name: Redémarrer Immich
    press:
      - action: rest_command.dockge_immich_restart
```

## Outils complémentaires

- **Build + Recreate** n’apparaît que si au moins un service possède une directive `build`. Il exécute `docker compose build --pull` sur ces services, puis `docker compose up -d --remove-orphans`.
- Les **notes de stack** sont stockées dans `.dockge-meta.json`, limitées à 10 000 caractères et incluses dans les sauvegardes. N’y place aucun secret.
- Le panneau **Git** est manuel, replié par défaut et disponible uniquement pour les stacks locales. Il refuse les identifiants intégrés aux URL, exclut les fichiers sensibles, crée les commits sous l’identité technique `Dockge Enhanced <dockge-enhanced@localhost>`, impose `pull --ff-only`, exige un arbre propre avant restauration et revalide Compose.
- Les **réseaux Docker** prennent en charge `bridge`, `macvlan` et `ipvlan`. Les suppressions et connexions exigent une confirmation ; `bridge`, `host` et `none` sont protégés. Docker Swarm et `overlay` sont volontairement exclus.
- Le contrôle de version de Dockge Enhanced reste informatif : aucune mise à jour automatique de l’application n’est déclenchée par cette API.
