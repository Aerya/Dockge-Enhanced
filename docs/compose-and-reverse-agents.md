# Modèles Compose, liens et agents

## Liens nommés

L’éditeur des URL accepte un libellé facultatif. Les anciens liens restent valides et peuvent être mélangés aux objets :

```yaml
x-dockge:
  urls:
    - https://example.org
    - url: https://example.org/admin
      label: Administration
```

Les variables Compose sont résolues comme auparavant. Seuls les liens HTTP/HTTPS valides sont rendus cliquables. Un libellé vide affiche l’adresse ; les champs supplémentaires d’un objet sont conservés par l’éditeur.

## Modèle .env

Dans **Paramètres → Général**, configurez le modèle Compose et son `.env`. Ils sont copiés dans les nouvelles stacks seulement. Un `.env` vide est autorisé. Les imports et les champs déjà modifiés ne sont pas remplacés si les paramètres arrivent après le début de la saisie. Les valeurs ne sont pas appliquées aux stacks existantes et ne remplacent pas `global.env`.

Exemple de valeurs communes : `TZ=Europe/Paris`, `PUID=1000`, `PGID=1000`. Évitez les secrets réutilisés dans ce modèle général.

## Tags d’agents

Dans la liste des instances liées, ouvrez **Tags de l’agent**. Entrez jusqu’à 20 tags de 40 caractères, séparés par des virgules. Ils sont normalisés en minuscules, dédoublonnés et enregistrés sur l’instance où vous les éditez, comme une organisation locale du tableau de bord. Le filtre par tag de la liste des stacks se combine avec le filtre par instance. Cela ne déclenche aucun déploiement groupé.

## Connexion inversée et rattachement automatique

Ce mode sert aux hôtes derrière NAT/CGNAT qui peuvent joindre un serveur central mais ne peuvent pas recevoir de connexion entrante depuis celui-ci. Il est facultatif. Le maillage direct reste disponible et continue à fonctionner de la même manière.

1. Sur le serveur central, ouvrez **Ajouter un agent en connexion inversée** et créez un jeton. Donnez éventuellement un nom ; sinon le hostname envoyé par le nœud sera utilisé.
2. Copiez le jeton pendant son affichage unique. Le serveur ne conserve que son empreinte SHA-256 et l’identifiant du compte émetteur.
3. Sur le nœud, utilisez votre compte administrateur Enhanced local existant : aucun nouveau compte n’est nécessaire. Sur une installation neuve uniquement, créez d’abord ce compte. Ce mode utilise l’authentification locale ; un nœud configuré exclusivement en trusted proxy n’est pas pris en charge. La 2FA peut être activée : le pont interne utilise une identité de fédération, sans désactiver la protection des connexions interactives.
4. Ajoutez les variables suivantes au service Enhanced existant dans Dockge, puis recréez ce service :

```yaml
environment:
  DOCKGE_REVERSE_HUB_URL: https://dockge.example.org
  DOCKGE_REVERSE_TOKEN_FILE: /run/secrets/dockge_reverse_token
secrets:
  - dockge_reverse_token
```

Au niveau racine du Compose :

```yaml
secrets:
  dockge_reverse_token:
    file: ./reverse-agent-token.txt
```

Le fichier contient uniquement le jeton. Protégez-le sur l’hôte. `DOCKGE_REVERSE_TOKEN` est également accepté ; le fichier prend priorité si les deux sont définis. L’URL doit être une origine HTTP(S), sans chemin, paramètres ni identifiants. Utilisez HTTPS sur Internet. Le pont interne se connecte au listener local configuré ; si ce listener utilise TLS, son certificat doit être valide pour cette adresse locale.

Le nœud se rattache automatiquement au démarrage. Après une coupure, il retente une connexion toutes les 30 à 45 secondes. Fermer une WebUI n’arrête pas le transport. Le serveur central peut consulter les stacks, leurs journaux et leurs statistiques, éditer les Compose et envoyer les commandes de gestion habituelles via ce canal. Le nœud n’obtient pas de session administrateur sur le serveur central : son jeton ne permet que de publier ses événements et de recevoir les commandes qui lui sont destinées.

**Révocation :** supprimer l’agent sur le serveur central coupe la connexion et invalide son jeton. Pour remplacer un jeton perdu, supprimez l’ancienne entrée et créez-en une nouvelle. Désactiver ou supprimer le compte émetteur révoque aussi les jetons, avec une revalidation des connexions actives toutes les 30 secondes. Un jeton est prévu pour un seul nœud ; ne le partagez pas entre plusieurs machines.

**Périmètre :** les agents inversés appartiennent au serveur central qui les a inscrits ; ils ne sont pas propagés dans le maillage complet. Ils n’exposent pas de lien direct vers leur WebUI. Les copies, migrations et répliques de données interserveurs nécessitent toujours une fédération directement joignable. Le rattachement automatique ne crée pas le compte initial du nœud et ne provisionne pas Docker ou la machine.
