# Gestionnaires de secrets par stack

[English](stack-secrets.md) · Français · [Deutsch](stack-secrets.de.md) · [Español](stack-secrets.es.md) · [简体中文](stack-secrets.zh-CN.md)

Associez une stack à Bitwarden Secrets Manager, 1Password, Doppler ou Infisical pour récupérer ses secrets au moment des opérations Compose, sans les recopier dans son fichier `.env`.
Correctif Bitwarden : le profil temporaire utilise le format TOML attendu par le CLI officiel, ce qui rétablit la récupération des secrets.

**Bitwarden Secrets Manager est pleinement fonctionnel. 1Password, Doppler et Infisical restent expérimentaux, sous réserve de tests utilisateurs.** Un test de connexion réussi confirme la récupération des secrets, pas le bon fonctionnement de l’application.

## Configuration

1. Dans **Paramètres → Gestionnaires de secrets**, sélectionnez l’instance qui héberge la stack. Créez une connexion avec un compte machine limité aux secrets nécessaires.
2. Pour Bitwarden, consultez la licence liée dans l’interface puis utilisez **Installer le CLI officiel Bitwarden**. Le CLI n’est pas redistribué dans l’image : l’installation télécharge la version officielle 2.1.0, vérifie son empreinte SHA-256 et conserve le binaire dans `data/secret-tools/bws`. Linux AMD64 et ARM64 sont pris en charge. Une installation manuelle dans `/usr/local/bin/bws` est également possible. Il s’agit de **Bitwarden Secrets Manager**, pas du coffre de mots de passe personnel ; la compatibilité Vaultwarden n’est pas annoncée.
3. Dans la stack enregistrée, ouvrez **Gestionnaires de secrets**, choisissez la connexion et renseignez sa portée.
4. Enregistrez puis cliquez sur **Tester l’accès enregistré**. Cette action ne déploie rien et n’affiche aucune valeur.
5. Référencez les variables dans Compose, puis déployez ou recréez la stack. L’enregistrement du réglage seul ne modifie pas les conteneurs existants.

| Fournisseur | Connexion | Portée dans la stack |
| --- | --- | --- |
| Bitwarden Secrets Manager | Jeton de compte machine et adresse HTTPS ; Cloud États-Unis, Europe ou serveur officiel auto-hébergé | Identifiant du projet |
| 1Password | Jeton de compte de service autorisé à lire l’Environment | Identifiant de l’Environment |
| Doppler | Jeton de service en lecture | Projet et configuration, facultatifs avec un jeton déjà limité à cette configuration |
| Infisical | Adresse HTTPS, Client ID et Client Secret d’une identité machine avec Universal Auth | Projet, environnement et dossier ; lecture du dossier sélectionné, sans imports ni récursion |

Préférez une déclaration obligatoire :

```yaml
services:
  app:
    image: votre-image
    environment:
      DISCORD_TOKEN: ${DISCORD_TOKEN:?required}
```

Les valeurs récupérées sont prioritaires pour l’interpolation Compose. Une valeur écrite directement dans `environment:` reste une valeur explicite : elle n’est pas remplacée automatiquement. Les variables sans valeur, telles que `DISCORD_TOKEN:`, sont aussi utilisables ; une variable encore non résolue après `compose config` bloque les opérations de création, démarrage, redémarrage et construction. Pour les variables facultatives, utilisez un défaut explicite, par exemple `${OPTIONAL_VALUE:-}`.

## Exécution et limites

- Les actions de l’interface, les opérations automatiques et les retours arrière réutilisent la connexion de la stack sur son instance. Mettez à jour les instances liées. Un retour arrière récupère les secrets actuels du fournisseur : il ne restaure pas leur ancienne version.
- L’échec du fournisseur bloque la commande ; il n’existe pas de repli silencieux vers un environnement vide. Les valeurs sont réutilisées en mémoire pendant une même opération, sans modifier l’environnement global de Dockge.
- L’état des conteneurs est lu directement dans Docker, sans résoudre le fichier Compose ni contacter le fournisseur. Les autres commandes Compose peuvent nécessiter son accès.
- La sortie des commandes Compose protégées et l’affichage de la configuration résolue sont masqués. La migration et la réplication de ces stacks sont refusées pour éviter de transporter une configuration résolue ou de déployer la cible sans son fournisseur.
- Les noms de variables qui pourraient modifier l’exécution de Docker, Compose ou Node sont refusés, notamment `PATH`, `DOCKER_*`, `COMPOSE_*`, `NODE_OPTIONS` et `LD_*`. Les noms dupliqués, les réponses vides et les valeurs invalides sont également refusés. Les secrets dynamiques Doppler ne sont pas demandés.
- Les jetons de connexion sont chiffrés dans `data/stack-secrets.json` avec la clé locale `data/stack-secrets.key`. Préservez cette clé et protégez les sauvegardes du volume de données : le fichier chiffré et sa clé réunis permettent de retrouver les jetons. Une clé manquante bloque leur lecture, elle n’est pas remplacée automatiquement.
- L’intégration n’écrit pas les valeurs récupérées dans les fichiers Compose, `.env` ou leur historique. Elle ne nettoie pas les anciens fichiers, historiques ou sauvegardes : retirez séparément les secrets qui y étaient déjà présents.
- **Ce n’est pas une garantie « zéro secret sur disque ».** Docker conserve les variables d’environnement dans la configuration des conteneurs, accessible aux administrateurs Docker. Les applications peuvent aussi écrire leurs propres journaux ou fichiers. L’intégration ne remplace pas les mécanismes de secrets montés en fichiers lorsqu’ils sont pris en charge par l’application.

## Sources

[1Password Environments](https://developer.1password.com/docs/sdks/environments/) · [Doppler Service Tokens](https://docs.doppler.com/docs/service-tokens) · [Infisical Universal Auth](https://infisical.com/docs/documentation/platform/identities/universal-auth) · [Bitwarden CLI](https://bitwarden.com/help/secrets-manager-cli/) · [Licence Bitwarden](https://github.com/bitwarden/sdk-sm/blob/bws-v2.1.0/LICENSE)
