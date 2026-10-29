# Sauvegardes et restauration Restic

[English](restic.md) · [Français](restic.fr.md) · [Español](restic.es.md) · [Deutsch](restic.de.md) · [简体中文](restic.zh-CN.md)

Dockge-Enhanced intègre un moteur [Restic](https://restic.net/) natif dans **Sauvegarde**. Il est indépendant de l’[intégration Zerobyte](zerobyte.fr.md) facultative, qui utilise ses propres dépôts et sa propre rétention.

## Contenu sauvegardé

- Les fichiers `compose.yaml`, override et `.env` de chaque stack incluse. Une stack peut être exclue de toutes les sauvegardes dans **Stacks à sauvegarder et cohérence**.
- Des chemins de données facultatifs : `/app/data` (données de Dockge-Enhanced) et autant de volumes montés dans le conteneur Enhanced que nécessaire, par exemple `/dockers-data`, sélectionnés dans **Volumes Docker à sauvegarder**. Les tailles sont calculées à la demande.
- Les exclusions intégrées (`*.log`, `__pycache__`, `node_modules`) s’appliquent toujours ; les patterns personnalisés sont transmis à `restic --exclude`.

Conservez l’intégralité du répertoire `/app/data` dans vos sauvegardes, y compris `two-factor.key` : une restauration de la seule base de données ne permet pas de déchiffrer les secrets TOTP sans cette clé.

## Destinations et planification

- Destinations : locale, SFTP/NAS (clé SSH ou mot de passe), S3/Backblaze B2 et REST Server. Plusieurs destinations peuvent être actives ; chaque exécution sauvegarde vers toutes.
- Pour une destination locale, montez un répertoire hôte dédié, par exemple `../../backup/dockge:/backup`, et utilisez `/backup` comme chemin de destination.
- Sauvegardes planifiées, **Sauvegarder maintenant** et sauvegardes à l’enregistrement du Compose sont disponibles. Les snapshots créés à l’enregistrement portent le tag `on-save`, respectent un délai de 60 secondes et ignorent volontairement `restic forget` : une rafale d’enregistrements ne supprime jamais d’anciens snapshots quotidiens ou hebdomadaires.
- La protection contre les exécutions simultanées, active par défaut, empêche une sauvegarde manuelle, planifiée ou à l’enregistrement de démarrer pendant qu’une autre sauvegarde Restic est en cours.
- Un verrou Restic obsolète est supprimé avec `restic unlock --remove-all` avant chaque sauvegarde et chaque rétention. Le code de sortie 3 (un fichier source n’a pas pu être lu) est enregistré comme un succès avec avertissements.

## Cohérence par stack

Chaque stack incluse dispose de son propre mode :

- **À chaud** : aucune interruption.
- **Arrêt puis redémarrage** : seuls les services en cours d’exécution sont arrêtés avant le snapshot, puis ces mêmes services sont redémarrés, même après un échec.
- **Hooks applicatifs** : des commandes avant/après sont exécutées avec `docker compose exec` dans le service choisi, par exemple un dump de base de données, sans accès au shell de l’hôte.

Les stacks sont redémarrées avant la rétention et les tests de restauration afin de limiter l’interruption.

## Paramètres, rétention et maintenance

- **Enregistrer** enregistre uniquement les paramètres et la rétention ; aucune sauvegarde ni purge n’est lancée.
- **Sauvegarder maintenant** lance une sauvegarde immédiate, puis la rétention ordinaire en cas de succès.
- Les outils de maintenance actualisent l’état des dépôts et des snapshots et exécutent `restic check` sur chaque destination active.
- La rétention ordinaire (`keepLast`, quotidienne, hebdomadaire, mensuelle) s’applique après les sauvegardes planifiées ou manuelles réussies, pas après les sauvegardes à l’enregistrement.
- Les snapshots obligatoires créés avant une auto-mise à jour protégée de Dockge-Enhanced ont leur propre rétention : une fois le nouveau snapshot créé **et vérifié**, les deux derniers snapshots de self-update de cette installation sont conservés. Un tag d’installation stable empêche ce nettoyage de toucher une autre instance partageant le dépôt. Si ce nettoyage échoue, la sauvegarde vérifiée est conservée.
- La liste des snapshots s’ouvre sur **Tous**. Un badge **Backup en retard** et une notification par intervalle apparaissent lorsque la dernière sauvegarde réussie date de plus de deux fois l’intervalle configuré.

## Initialisation des dépôts

Lors de la première sauvegarde, Restic n’initialise **que les dépôts dont l’absence est démontrée**. Les erreurs d’accès, de réseau et de mot de passe bloquent l’initialisation au lieu de créer un nouveau dépôt. L’interface affiche l’état du dépôt de chaque destination active.

## Chevauchement entre dépôt et sources

Conservez de préférence les dépôts Restic locaux en dehors des dossiers sélectionnés pour la sauvegarde.

- Si un dépôt local se trouve sous une source sélectionnée, l’enregistrement des paramètres affiche un avertissement et les sauvegardes excluent automatiquement le dépôt, ses archives de réinitialisation et ses autres chemins de montage Docker. Les liens symboliques résolus sont également contrôlés, et les destinations locales désactivées restent protégées.
- Par exemple, `/app/data` peut rester sélectionné avec un dépôt dans `/app/data/backups`.
- Sélectionner un dépôt, ou l’un de ses sous-dossiers, comme source de sauvegarde est refusé. Les chemins sont de nouveau vérifiés avant chaque sauvegarde.
- Ce contrôle ne déplace ni ne réinitialise jamais un dépôt. Les chemins, mots de passe et réglages de rétention existants sont conservés.

## Réinitialisation sécurisée d’un dépôt (Local, SFTP, S3 et REST)

Dans **Sauvegarde → Maintenance et diagnostics**, choisissez une destination active et prévisualisez son dépôt et le nombre de snapshots.

- La réinitialisation exige deux confirmations explicites, la phrase de confirmation exacte et un jeton à usage unique de courte durée.
- Un dépôt local est renommé en archive conservée avant la création d’un nouveau dépôt. Un dépôt distant bascule vers un nouveau répertoire SFTP, un nouveau préfixe S3 ou une nouvelle URL REST ; l’ancien dépôt n’est pas supprimé.
- Le nouveau dépôt actif ne contient aucun ancien snapshot. Les entrées de l’historique récent ne sont supprimées que pour cette destination.
- L’ancien dépôt reste à son emplacement d’origine pour la récupération : il ne s’agit **pas** d’une suppression définitive des données sauvegardées.
- Ne réinitialisez pas un dépôt partagé par d’autres clients sans les coordonner au préalable.

## Restauration et vérification

- Le navigateur de snapshots affiche côte à côte les fichiers Compose, `.env` et de volumes, avec leur état par rapport au snapshot précédent (Nouveau / Modifié / Inchangé) et au disque actuel (OK / Modifié / Absent).
- Les fichiers texte peuvent être prévisualisés et comparés au disque ou au snapshot précédent avant restauration.
- Restaurez n’importe quelle sélection de fichiers, ou une stack entière avec **Restaurer la stack**.
- Après chaque sauvegarde planifiée, un test de restauration lit un vrai fichier du nouveau snapshot et enregistre le résultat dans l’historique. Utilisez **Vérifier l'intégrité** pour un `restic check` complet.
- Les auto-mises à jour protégées et les workflows de récupération s’appuient sur ces snapshots Restic vérifiés.

## Choisir la sauvegarde avant l’auto-mise à jour

Trois choix avant la mise à jour d’Enhanced : Restic (par défaut), Zerobyte avec sauvegarde vérifiée, ou aucune sauvegarde préalable après confirmation du risque de perte de données. Dans ce dernier mode, Enhanced ne lance ni ne vérifie aucune sauvegarde et n’exige pas de preuve de sauvegarde externe. Avec Zerobyte, un job dédié doit réussir et son nouveau snapshot contenir le fichier de récupération de cette mise à jour ; un échec ou un délai de 30 minutes bloque la mise à jour. Le rollback d’image ne restaure pas les données modifiées.

Configurez Zerobyte dans Sauvegarde. Utilisez un job dédié : source = dossier complet de données Enhanced monté dans Zerobyte, sans filtres, hooks, planification ni tentatives automatiques. Enhanced vérifie le snapshot frais et bloque la mise à jour en cas d’échec ou après 30 minutes. La rétention reste gérée dans Zerobyte.
