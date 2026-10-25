# Connexion OpenID Connect (OIDC)

[English](oidc.md) · [Français](oidc.fr.md) · [Español](oidc.es.md) · [Deutsch](oidc.de.md) · [简体中文](oidc.zh-CN.md)

Dockge-Enhanced peut connecter les utilisateurs directement avec un fournisseur OpenID Connect comme Pocket ID, Authentik, Keycloak, Authelia ou Google, sans reverse proxy devant. L’OIDC fonctionne **en plus** des comptes locaux, de la 2FA et des comptes limités, en mode d’authentification `local` (le mode par défaut). Il est ignoré lorsque `DOCKGE_AUTH_MODE` vaut `disabled` ou `trusted-proxy`.

Dockge utilise le flux Authorization Code avec PKCE (S256), `state` et `nonce`. Il valide le jeton d’identité (signature, émetteur, audience, expiration, nonce). Après une connexion réussie, Dockge ouvre la même session qu’une connexion par mot de passe : les API HTTP, la révocation, le journal d’audit et les comptes limités se comportent exactement de la même façon.

## Configuration du fournisseur

Créez un client (application) OIDC chez votre fournisseur :

- **URI de redirection / URL de callback** : `https://dockge.example.com/api/auth/oidc/callback`
- **Type de client** : confidentiel (avec un secret client) ou public (PKCE seul). Les deux fonctionnent.
- **Scopes** : `openid profile email`. Ajoutez `groups` si vous utilisez `DOCKGE_OIDC_ADMIN_GROUPS` et que votre fournisseur l’exige (Pocket ID, Authentik).

## Configuration

| Variable | Défaut | Description |
|---|---|---|
| `DOCKGE_OIDC_ISSUER` | *(aucun)* | URL de l’émetteur. La définir active l’OIDC. La découverte utilise `<issuer>/.well-known/openid-configuration` |
| `DOCKGE_OIDC_CLIENT_ID` | *(obligatoire)* | Identifiant du client |
| `DOCKGE_OIDC_CLIENT_SECRET` | *(aucun)* | Secret du client. Laisser vide pour un client public |
| `DOCKGE_OIDC_CLIENT_SECRET_FILE` | *(aucun)* | Fichier contenant le secret (recommandé, prioritaire) |
| `DOCKGE_OIDC_REDIRECT_URI` | *(obligatoire)* | URL publique de callback, se terminant par `/api/auth/oidc/callback` |
| `DOCKGE_OIDC_SCOPES` | `openid profile email` | Scopes demandés |
| `DOCKGE_OIDC_USERNAME_CLAIM` | `preferred_username` | Claim utilisé comme nom d’utilisateur Dockge (`email` est aussi courant) |
| `DOCKGE_OIDC_GROUPS_CLAIM` | `groups` | Claim contenant les groupes de l’utilisateur |
| `DOCKGE_OIDC_ADMIN_USERS` | *(aucun)* | Noms d’utilisateur, séparés par des virgules, qui deviennent administrateurs |
| `DOCKGE_OIDC_ADMIN_GROUPS` | *(aucun)* | Groupes, séparés par des virgules, dont les membres sont administrateurs (voir plus bas) |
| `DOCKGE_OIDC_LINK_EXISTING` | `false` | Autorise la première connexion OIDC à rattacher un compte local existant portant le même nom |
| `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN` | `false` | Masque le formulaire identifiant/mot de passe et refuse les connexions par mot de passe |
| `DOCKGE_OIDC_BUTTON_LABEL` | « Se connecter avec le SSO » (traduit) | Texte du bouton de connexion |
| `DOCKGE_OIDC_ALLOW_HTTP` | `false` | Autorise des URL `http://` pour l’émetteur et la redirection. **Pour des tests locaux uniquement** |

Dockge refuse de démarrer si la configuration est incomplète, par exemple sans identifiant client ni URI de redirection, ou avec `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN` sans émetteur. L’URI de redirection provient uniquement de la configuration, jamais des en-têtes de la requête. Si le fournisseur est injoignable, la connexion locale continue de fonctionner et le bouton SSO signale l’erreur.

### Exemple : Pocket ID

```yaml
services:
  dockge:
    environment:
      - DOCKGE_OIDC_ISSUER=https://id.example.com
      - DOCKGE_OIDC_CLIENT_ID=0f6c...                     # depuis Pocket ID → OIDC Clients
      - DOCKGE_OIDC_CLIENT_SECRET_FILE=/run/secrets/dockge_oidc_secret
      - DOCKGE_OIDC_REDIRECT_URI=https://dockge.example.com/api/auth/oidc/callback
      - DOCKGE_OIDC_SCOPES=openid profile email groups
      - DOCKGE_OIDC_ADMIN_GROUPS=dockge-admins
      - DOCKGE_OIDC_BUTTON_LABEL=Se connecter avec Pocket ID
    secrets:
      - dockge_oidc_secret

secrets:
  dockge_oidc_secret:
    file: ./secrets/dockge_oidc_secret
```

Pour Authentik, l’émetteur est l’« OpenID Configuration Issuer » de l’application, par exemple `https://auth.example.com/application/o/dockge/`. Pour Keycloak, c’est `https://kc.example.com/realms/<realm>`.

## Comptes et rôles

- Chaque identité OIDC est liée à un compte Dockge par l’identifiant stable du fournisseur (émetteur + `sub`). Renommer un utilisateur chez le fournisseur ne crée pas de nouveau compte.
- À la première connexion, un compte absent est créé comme **compte limité sans aucun droit sur les stacks** : il ne voit rien tant qu’un administrateur ne lui accorde pas d’accès dans **Paramètres → Sécurité → Utilisateurs et permissions**. Les comptes liés y portent un badge **SSO**.
- Les **administrateurs** proviennent de `DOCKGE_OIDC_ADMIN_USERS` et `DOCKGE_OIDC_ADMIN_GROUPS` :
  - Lorsque `DOCKGE_OIDC_ADMIN_GROUPS` est défini, l’appartenance au groupe fait foi à chaque connexion : rejoindre le groupe donne les droits d’administrateur, le quitter repasse le compte en compte limité. Le compte conserve ses droits sur les stacks. Les sessions ouvertes sont reconnectées avec le nouveau rôle.
  - Avec seulement `DOCKGE_OIDC_ADMIN_USERS`, les utilisateurs listés sont promus et personne n’est jamais rétrogradé.
- **Il n’existe pas de règle implicite « le premier utilisateur devient administrateur ».** Sur une installation neuve, créez le premier administrateur avec la page de configuration initiale ou `DOCKGE_BOOTSTRAP_*`, ou configurez une correspondance admin. Sinon, la première connexion OIDC est refusée avec une explication, afin qu’une installation ne contenant que des comptes limités ne puisse pas vous bloquer.
- Les **comptes locaux existants** ne sont pas rattachés par défaut : un utilisateur OIDC dont le nom correspond à un compte local est refusé. Définissez `DOCKGE_OIDC_LINK_EXISTING=true` pour les rattacher à la première connexion. Lorsque le claim de nom d’utilisateur est `email`, le rattachement exige aussi `email_verified` à true. Cela empêche un utilisateur du fournisseur qui peut choisir son nom ou son e-mail de prendre le contrôle d’un administrateur local.
- Désactiver un compte dans Dockge bloque aussi sa connexion OIDC.

## 2FA

Les connexions OIDC ne demandent pas le code TOTP local : l’authentification multifacteur relève du fournisseur. La 2FA locale reste appliquée aux connexions par mot de passe du même compte.

## Désactiver la connexion locale

Avec `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN=true`, la page de connexion n’affiche que le bouton SSO et le serveur refuse les connexions par mot de passe. Les sessions existantes, les jetons de fédération entre instances et la page de configuration initiale continuent de fonctionner.

**Récupération :** si le fournisseur devient indisponible, retirez `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN` et redémarrez le conteneur pour vous connecter avec un compte administrateur local.

## Pas encore inclus

- Correspondance entre groupes et droits par stack (seul le rôle administrateur est mappé).
- Déconnexion chez le fournisseur (RP-initiated logout) : **Déconnexion** ferme uniquement la session Dockge.
- Configuration depuis l’interface Paramètres : l’OIDC se configure par variables d’environnement.
