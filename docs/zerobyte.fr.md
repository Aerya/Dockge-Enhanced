# Zerobyte (facultatif)

[English](zerobyte.md) · [Français](zerobyte.fr.md) · [Español](zerobyte.es.md) · [Deutsch](zerobyte.de.md) · [简体中文](zerobyte.zh-CN.md)

Dans **Sauvegardes**, activer le bloc **Zerobyte (facultatif)**. OFF replie entièrement le bloc et conserve configuration, clé API, conteneurs et données. Restic Enhanced conserve sa couverture et sa propre rétention : aucune exclusion automatique, migration ou suppression.

- **Instance existante** : renseigner l’origine HTTP(S) accessible depuis le serveur Enhanced et une clé API créée dans les paramètres Zerobyte. Enregistrer puis tester. Aucun contrôle Docker de cette instance externe.
- **Installation gérée** : Enhanced crée une stack Compose propre à son instance avec l’image officielle `ghcr.io/nicotsx/zerobyte:v0.43.2`. Les dossiers de données et de stacks Enhanced doivent être des bind mounts identifiables. Configuration/base et restauration utilisent des volumes persistants automatiques ; aucun dossier de configuration à choisir. Aucun socket Docker, SYS_ADMIN ou FUSE dans Zerobyte.

Choisir au moins une **source existante** (dossier hôte ou volume Docker nommé) et une **destination distincte** (dossier hôte). Les sources sont RO sous `/sources/local-…`, les destinations RW sous `/destinations/store-…`. Déclarer les destinations distantes déjà montées sur l’hôte : un partage déclaré mais absent est refusé. L’identité de chaque système de fichiers de destination est contrôlée à chaque démarrage ; une modification empêche le démarrage et exige une revalidation. Un partage indisponible peut néanmoins bloquer ou faire échouer les E/S. Ce contrôle ne garantit pas sa disponibilité réseau.

Les chemins système, liens symboliques, traversées, chevauchements parent/enfant, alias de bind mounts et recouvrements des données internes ou dépôts Restic locaux Enhanced, même désactivés, sont refusés. Pour les dépôts Restic distants, confirmer explicitement leur séparation : Enhanced ne peut pas la prouver. Le vérificateur hôte temporaire est sans réseau, monte la racine en lecture seule et ne conserve que le droit DAC_READ_SEARCH après suppression des autres capacités.

Choisir un port libre avec `http://127.0.0.1:<port>` et confirmer l’installation. Accès WebUI local uniquement ; utiliser un tunnel SSH depuis une autre machine. Enhanced rejoint le réseau du projet et utilise son alias de service dédié : conserver cette connexion réseau lors du remplacement du conteneur Enhanced.

Ouvrir Zerobyte, créer le compte, conserver la clé de récupération et générer une clé API. Enregistrer cette dernière dans Enhanced. **Les montages ne créent ni source logique, ni dépôt, ni job.** Créer les sources Directory et les dépôts Local aux chemins affichés dans Zerobyte, puis les jobs. Les jobs créés depuis Enhanced sont désactivés ; définir planification et rétention dans Zerobyte.

Une nouvelle application identique conserve le projet et les volumes. Pour modifier les montages, configurer d’abord la connexion API, désactiver les jobs et attendre la fin des opérations ; confirmer ensuite la recréation. L’ancien Compose est réappliqué si le remplacement échoue. Revoir les chemins logiques des jobs ensuite. Aucun endpoint de désinstallation ou suppression de volumes. Garder `.env` et `.zerobyte.json` privés : ils permettent de préserver secrets et propriété de l’installation. Un échec initial conserve métadonnées et volumes pour diagnostic ou nouvelle tentative.

Sauvegarde manuelle et rétention exigent une confirmation. La rétention peut supprimer des snapshots du seul job Zerobyte selon sa politique. La restauration gérée vérifie automatiquement son volume `/restore-test`. La restauration externe exige une racine **vérifiée et dédiée dans Zerobyte**, explicitement acquittée pour cette connexion. Ne jamais utiliser un dossier applicatif, source ou destination. Chaque restauration utilise un nouveau sous-dossier aléatoire, sans suppression et avec `overwrite: never`. Vérifier la fin de l’opération dans Zerobyte. Pour une instance externe, l’opérateur doit vérifier lui-même le montage dédié.

Clés côté serveur, fichier 0600, réponses filtrées, erreurs distantes expurgées, redirections refusées, taille et durée des réponses bornées. Authentification HTTP Enhanced sur les endpoints de gestion ; les seuls callbacks pre/post utilisent leur secret propre au workflow. La supervision fédérée et les hooks des workflows gérés sont décrits ci-dessous.

Textes EN, FR, DE, ES et chinois simplifié ; les autres langues utilisent le fallback anglais existant, sans altérer leurs traductions. Voir [la documentation technique et les références officielles](zerobyte.md).

## Assistant et gestion des pannes

L’assistant géré propose maintenant un plan explicite : une source montée, une destination, un nom, un cron et une durée maximale de 1 à 120 minutes. Après confirmation, il crée ou réutilise la source logique Directory, un dépôt Local dédié et un job désactivé. Zerobyte ajoute son identifiant sous le dossier de dépôt affiché. Les réessais sont idempotents ; aucune ressource conflictuelle n’est adoptée ni supprimée. Un plan existant ne change pas silencieusement de politique : choisir un nouveau nom pour d’autres arrêts de stacks ou délais.

Les hooks HTTP officiels, avec secret propre au workflow, s’appliquent aux sauvegardes manuelles **et planifiées**. Avant tout arrêt d’application : vérification du montage hôte, de l’empreinte du système de fichiers, puis sonde bornée d’écriture/fsync/suppression dans la destination montée. Pendant l’exécution, un contrôle périodique détecte les indisponibilités. Panne ou délai dépassé : annulation demandée, redémarrage des seuls services initialement actifs, alerte persistante, notifications Discord/Apprise du backup si configurées. La livraison d’une notification ne peut pas être garantie.

**Aucun repli local automatique.** Pour un secours local, créer explicitement un second plan vers un dossier distinct, puis choisir de l’exécuter. Cela évite de masquer une panne ou remplir un disque sans politique de capacité et de transfert. Le workflow interrompu reste suspendu ; l’acquittement exige que la tâche distante soit terminée. Vérifier les snapshots éventuels : demander l’annulation ne prouve pas à lui seul que le processus distant s’est arrêté.

Les arrêts facultatifs sont limités aux stacks gérées dans le dossier de cette instance, avec contrôle des labels Docker. Enhanced et Zerobyte sont protégés. Le journal est écrit avant chaque arrêt, puis permet la récupération après échec de préparation, sauvegarde échouée, callback final manquant ou redémarrage d’Enhanced. Un échec de redémarrage conserve le journal et bloque les opérations Restic natives concernées. Réglages, exclusions et rétention Restic natifs ne changent pas. Cela ne protège pas d’une modification concurrente par un opérateur ni d’une indisponibilité de Docker ou de l’hôte.

Les jobs créés hors assistant restent signalés comme dépourvus de ces hooks. Les jobs de l’assistant sont créés sans rétention automatique ; la rétention manuelle exige toujours confirmation. Si l’opérateur ajoute ensuite une politique directement dans Zerobyte, ses automatismes natifs s’appliquent : Enhanced n’intercepte pas les modifications de configuration effectuées dans l’application tierce. Conserver l’alias réseau `enhanced-<owner>` d’Enhanced ; réappliquer l’installateur le répare après remplacement du conteneur.

## Connexions externes et fédération

Avertissement et acquittement sont liés à l’URL **et à la clé API** : changer l’un des deux révoque la validation. Connexion et supervision restent accessibles ; les mutations externes exigent l’acquittement. La restauration externe reste désactivée sans racine dédiée explicitement enregistrée. L’ancienne variable globale ne suffit plus. Les chemins connus des sources et dépôts locaux sont comparés au moment de restaurer ; liens symboliques externes et séparation physique restent à vérifier par l’opérateur. En mode géré, le volume Docker de restauration dédié, propriétaire, RW et distinct des autres montages est vérifié automatiquement.

La vue des instances liées agrège des compteurs filtrés via le transport fédéré authentifié existant, sans transférer de clé Zerobyte. Elle distingue intégration désactivée, Zerobyte inaccessible et pair hors ligne/incompatible. Les opérations restent sur l’instance propriétaire. Aucun pair de production n’est sollicité pour les tests de développement.

### Diagnostic et migration d’un job existant

Le diagnostic externe interroge uniquement l’API : configuration, inventaire, séparation des chemins connus et partage des dépôts entre jobs. Les montages physiques, liens symboliques, identité du serveur distant, permissions réelles et essai de restauration restent explicitement marqués « opérateur ». Un résultat API positif ne certifie pas ces points.

Pour protéger un job existant, le désactiver dans Zerobyte, attendre la fin des tâches et choisir les stacks et la durée maximale dans l’assistant. Le bouton de migration affiche le plan avant confirmation. Seuls les hooks et le nombre de tentatives automatiques sont modifiés. Source, dépôt, snapshots, calendrier, filtres et rétention sont conservés ; le job reste désactivé. Les hooks préexistants et les dépôts partagés entre plusieurs jobs sont refusés. Après une réponse API incertaine, conserver le job désactivé et relancer le même plan pour vérifier la migration.

L’état de reprise applicative est affiché indépendamment du résultat du backup. Si Docker ne permet pas le redémarrage, le journal est conservé et la récupération est retentée. Vérifier Docker et les stacks indiquées ; une application reprise ne prouve pas la réussite de la sauvegarde. Le journal est synchronisé sur disque avant chaque arrêt.

### Exercices de panne

Utiliser des partages et stacks fictifs dédiés. Vérifier d’abord un backup et une restauration avec comparaison du contenu. Injecter ensuite séparément : rupture TCP, serveur arrêté, permissions retirées, partage en lecture seule et espace épuisé. Vérifier le refus avant tout arrêt applicatif et l’alerte persistante. Couper aussi pendant une exécution ; vérifier la demande d’annulation, l’état réel de la tâche et la reprise des seuls services initialement actifs.

Pour simuler Docker indisponible, couper un relais de socket réservé à l’instance de test ; ne pas arrêter le démon partagé avec la production. Un redémarrage brutal des seuls conteneurs de test vérifie le journal, sans constituer un essai de coupure électrique physique de l’hôte. Tester la fédération avec deux instances isolées, un refus d’authentification et une version antérieure.

Les contrôles de stockage utilisent des noms de sondes stables et un verrou local par destination pour borner les sondes bloquées par un appel NFS « hard ». Le délai côté Enhanced ne peut pas interrompre de force un appel noyau non interruptible : le rétablissement du serveur peut rester nécessaire. Les alertes répétées d’un même workflow sont limitées à une notification toutes les cinq minutes. Après un refus d’authentification fédérée, utiliser la réauthentification de l’agent ; réactiver le compte distant seul ne relance pas le transport arrêté pour raisons de sécurité.

### Intégrité des jobs et reprise manuelle

Les jobs enregistrés par Enhanced sont vérifiés avant chaque lancement depuis Enhanced et dans le pré-hook, ainsi qu’environ chaque minute lorsqu’aucune sauvegarde applicative n’est active. Les deux URL de callback, leur authentification, la source, le dépôt et les tentatives automatiques doivent correspondre au workflow. Un job absent, modifié ou non vérifiable est signalé ; Enhanced refuse son lancement. « Vérifier la protection des jobs » permet une vérification immédiate après correction. Aucun hook n’est remplacé silencieusement. Si les hooks sont entièrement supprimés et le job lancé directement dans Zerobyte, Enhanced ne peut pas intercepter cette exécution ; conserver la supervision et les hooks.

Une reprise échouée affiche les stacks et services inscrits au journal. « Réessayer la reprise des applications » ne lance aucun backup : il retente uniquement ces services, après vérification que la tâche distante est terminée. Un backup interrompu n’est pas annoncé comme réussi parce que les applications ont redémarré.

### Revalidation explicite d’un stockage

Après un changement volontaire de stockage, désactiver tous les jobs, attendre la fin des tâches et vérifier physiquement l’identité du serveur, le partage et la séparation des dépôts. Prévisualiser les empreintes avant/après puis attester cette vérification et confirmer. Le consentement est lié à la révision exacte du plan ; toute modification exige une nouvelle prévisualisation.

Si Zerobyte est arrêté par le garde-fou (code 31), Enhanced peut consulter en lecture seule la base du volume de données dédié dont la propriété Docker est vérifiée. Tous les jobs doivent être désactivés et les tâches terminées, même dans ce mode. Après arrêt du processus, Enhanced revérifie l’inventaire et les montages avant de remplacer le garde-fou. Le Compose et les métadonnées antérieurs sont conservés dans des fichiers `.pre-revalidation` privés. Seul Zerobyte est redéployé ; aucun dossier local de repli n’est accepté pour une destination déclarée distante.

Les résumés fédérés distinguent les refus d’authentification connus, les instances déconnectées, les réponses incompatibles et les délais dépassés. Un délai ne prouve pas à lui seul qu’une version est ancienne : le message demande de vérifier connexion et compatibilité. Voir aussi [les exercices reproductibles](../extra/zerobyte-lab/README.md).
