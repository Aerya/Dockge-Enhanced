<p align="center">
  <img src="https://raw.githubusercontent.com/Aerya/Dockge-Enhanced/main/frontend/public/icon.svg" width="120" alt="Dockge Enhanced logo">
</p>

# Dockge Enhanced

Un fork enrichi de [Dockge](https://github.com/louislam/dockge) — ajoute la surveillance d'images, le scan de sécurité, les sauvegardes automatiques, la détection de crash loop et la gestion des ressources Docker, le tout depuis l'interface web.

> 🇬🇧 [English version](README.md) · [Article de présentation](https://upandclear.org/2026/03/28/gerer-ses-conteneurs-docker-autrement-le-fork-dockge-enhanced-surveillance-dimages-scan-cve-backup-automatique-gestion-des-ressources/)

<p align="center">
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white" alt="Docker">
  <img src="https://github.com/Aerya/Dockge-Enhanced/actions/workflows/build-publish.yml/badge.svg?branch=main" alt="Build">
  <img src="https://img.shields.io/badge/arch-amd64%20%7C%20arm64-lightgrey" alt="multi-arch">
  <img src="https://img.shields.io/badge/i18n-FR%20%7C%20EN-blue" alt="i18n">
  <img src="https://img.shields.io/badge/based%20on-Dockge-orange?logo=github&logoColor=white" alt="based on Dockge">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
</p>

> **Tu l'utilises ? Tu l'aimes ? [⭐ Mets une étoile !](https://github.com/Aerya/Dockge-Enhanced)** — ça prend deux secondes.

---

## Fonctionnalités

🆕 **Résumé cliquable des statuts de stacks** — L'en-tête de la liste affiche désormais le total des stacks, les actives, les arrêtées et les inactives. Chaque compteur filtre directement la liste, avec un tooltip court sur les compteurs Arrêtées et Inactives pour expliquer la différence.

🆕 **Tailles des volumes montés dans les cartes conteneurs** — Chaque page de stack affiche les volumes montés directement dans l'encart de chaque conteneur, avec point de montage, calcul de taille à la demande et accès direct au navigateur **Fichiers** existant pour chaque mount.

🆕 **Logs de stack avec période et recherche** — Le terminal de logs des pages compose peut charger les dernières lignes ou une fenêtre `24 h`, `3 jours`, `7 jours` ou `14 jours` via `docker compose logs --since`, tout en conservant le filtre par service et l'option d'horodatage. Une recherche intégrée permet de naviguer entre les occurrences dans le scrollback affiché.

🆕 **Détails système hôte dans le Monitoring** — L'onglet **Monitoring** affiche désormais le modèle CPU, le nombre de cœurs, l'utilisation par cœur, les moyennes de charge 1/5/15 min, le nombre de processus, l'uptime et des températures CPU/disques lisibles quand l'environnement expose les outils nécessaires (`/proc`, `/sys`, `sensors`, `smartctl` ou les helpers disque Synology).

**Authentification locale, bootstrap et proxy de confiance** — Le mode historique reste inchangé par défaut, sans nouvelle variable ni modification du Compose. Les déploiements automatisés peuvent créer le premier administrateur depuis un secret, tandis que le mode optionnel `trusted-proxy` accepte une identité transmise par OAuth2 Proxy, Traefik ForwardAuth ou un autre proxy uniquement lorsque la connexion provient d’un réseau explicitement autorisé. Les API REST et Socket.IO appliquent la même politique, `/setup` est verrouillé durablement après initialisation et aucun chemin technique ne doit être rendu public.

**Détection complète des images dans le watcher** — L’onglet **Images** de `/watcher` liste désormais les images déclarées par toutes les stacks locales, même lorsqu’elles sont arrêtées et que leurs conteneurs ou images locales ont été supprimés. La découverte suit les quatre noms de fichiers acceptés par Dockge (`compose.yaml`, `compose.yml`, `docker-compose.yaml` et `docker-compose.yml`) et s’appuie sur le modèle résolu par Docker Compose pour prendre en charge les variables, ancres, `extends` et `include`, sans devoir effectuer un pull au préalable.

**Recherche dans les ressources Docker** — La page **Ressources Docker**, y compris lorsqu’elle est ouverte depuis `/watcher`, dispose d’un champ de recherche commun aux onglets Images, Volumes et Hors Dockge. Le filtre retrouve une ressource par nom, image, tag, identifiant, stack, service ou conteneur associé.

🆕 **NEW — Cohérence du backup par stack** — Chaque stack incluse dans le backup Restic dispose de son propre mode : **À chaud** (aucune interruption), **Arrêter puis redémarrer** (Dockge mémorise uniquement les services actifs, les arrête avant le snapshot et redémarre les mêmes services même en cas d'échec), ou **Hooks applicatifs**. Les hooks avant/après sont exécutés avec `docker compose exec` dans le service choisi pour produire un dump, vider un cache ou verrouiller proprement une application sans donner accès au shell de l'hôte. Les stacks sont remises en état avant la rétention Restic et le restore test afin de réduire l'interruption. Cette fonctionnalité s'inspire de l'approche de cohérence des sauvegardes de [Repliqate](https://github.com/lminlone/repliqate), tout en restant intégrée au moteur Restic, aux destinations et aux restaurations de Dockge Enhanced.

**Planification automatique des stacks** — Chaque stack locale peut désormais être démarrée et arrêtée selon deux règles indépendantes, directement depuis sa page ou depuis le nouvel onglet **Planification** de `/watcher`. Les presets couvrent **chaque jour**, **chaque semaine**, **toutes les 2 semaines** avec une date de première exécution servant d'ancrage, et **chaque mois** ; un mode **Libre** accepte aussi une expression cron Unix à 5 champs (`minute heure jour-du-mois mois jour-de-semaine`). La prochaine exécution, le fuseau horaire du serveur et le résultat du dernier déclenchement sont persistés. Le démarrage exécute `docker compose up -d --remove-orphans` et l'arrêt `docker compose stop`. Les règles sont désactivées par défaut et concernent les stacks locales, pas les agents distants.

**Navigateur et éditeur de fichiers de volumes** — Sur chaque page de stack, chaque conteneur dispose d'un bouton **Fichiers** qui ouvre un explorateur des volumes montés (binds et volumes nommés) directement dans la WebUI. On parcourt l'arborescence, on ouvre un fichier texte (JSON, conf, yaml, html, php, scripts, logs…) dans un éditeur intégré, et on l'enregistre — sans lancer de console en parallèle. On peut aussi **créer un fichier ou un dossier, renommer, supprimer et téléverser**. L'accès passe par un conteneur helper busybox éphémère qui monte le volume via le socket Docker : ça fonctionne **même quand la stack est arrêtée**, et même sur des images sans shell (distroless/scratch), sans que le chemin hôte soit monté dans le conteneur Dockge. L'écriture se fait en place (`cat >`) pour préserver propriétaire et permissions. Restreint aux points de montage du conteneur, fichiers texte jusqu'à 5 Mio, refus des binaires à l'édition, et chaque opération est journalisée dans l'audit.

**Lien vers la source de l'image** — Sur la page d'une stack, chaque image affiche une petite icône cliquable à côté de son nom, qui ouvre la page source : dépôt GitHub pour `ghcr.io/owner/repo`, page Docker Hub pour les images officielles/communautaires, dépôt Quay/GitLab, etc.

**Recherche d'image dans le watcher** — L'onglet **Images** de `/watcher` dispose d'un champ de recherche qui filtre instantanément la table par nom d'image ou de stack — pratique pour retrouver vite une image et modifier son rythme de mise à jour quand on en a beaucoup.

**Terminal de progression agrandi** — L'encart de progression des opérations de stack (deploy/restart/update) est plus haut et défilable, pour afficher davantage de conteneurs avant que Docker Compose ne tronque la sortie en `... N more`.

**Éditeur d'override compose** — Chaque page de stack en mode édition dispose désormais d'un éditeur dédié `compose.override.yaml`, en plus du fichier compose principal et du `.env`. Docker Compose fusionne automatiquement cet override par-dessus le fichier principal au déploiement (découverte automatique, sans `-f` explicite) : pratique pour séparer une base commune des surcharges spécifiques à une machine ou un environnement. L'override est validé en YAML à la sauvegarde, écrit dans le dossier de la stack, et supprimé automatiquement s'il est laissé vide.

**Protection de connexion Cloudflare Turnstile** — Un captcha [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) optionnel peut être ajouté à la page de connexion (utile quand l'instance est exposée, même derrière un reverse proxy). À activer dans **Paramètres → Sécurité** avec une clé de site et une clé secrète : le widget s'affiche alors sous le formulaire de login et le token est vérifié côté serveur via l'API `siteverify` avant toute tentative d'authentification. La clé secrète reste côté serveur ; seule la clé de site publique est transmise au navigateur. La 2FA et la reconnexion par token JWT ne sont pas impactées.

**Coloration des variables dans l'éditeur YAML** — Les références de variables (`${VAR}`, `${VAR:-defaut}`, `$VAR`) sont désormais surlignées dans les éditeurs compose, override et `.env`. Les variables **définies** (présentes dans le `.env`) apparaissent en bleu, tandis que les variables **non définies** sont soulignées en rouge — pour repérer immédiatement une faute de frappe ou une variable oubliée dans la configuration.

**Éditeur YAML plein écran + confort CodeMirror** — Un bouton plein écran sur chaque éditeur (compose, override, `.env`) bascule l'édition sur tout l'écran, idéal pour les grosses stacks. L'éditeur gagne aussi le **repli de code** (folding), la **recherche** (Ctrl+F), l'**auto-fermeture des crochets** et la mise en évidence des occurrences sélectionnées.

**Suppression de stack conditionnelle / forcée** — Le dialogue de suppression propose deux options. *Supprimer les fichiers du disque* (cochée par défaut) : décochée, les conteneurs sont arrêtés et retirés mais les fichiers compose/`.env` sont conservés et la stack reste éditable. *Forcer la suppression même en cas d'échec de l'arrêt* : poursuit la suppression du dossier même si `docker compose down` renvoie une erreur, pour nettoyer une stack récalcitrante.

**Auto-heal des healthchecks** — L'onglet **Monitoring** peut maintenant écouter les événements Docker `health_status` des conteneurs qui définissent déjà un healthcheck Docker/Compose. Quatre modes sont disponibles : notifier seulement, redémarrer le conteneur unhealthy, redémarrer le service Compose, ou utiliser le mode intelligent stack-aware. Le mode intelligent redémarre le service par défaut mais recrée toute la stack quand le service unhealthy sert de namespace réseau à d'autres services via `network_mode: service:<service>` (cas typique VPN/Gluetun). Les événements sont journalisés dans l'UI, les notifications réutilisent les canaux Discord/Apprise du Monitoring, et un cooldown évite les boucles de relance. Dockge Enhanced n'injecte pas de healthchecks génériques automatiquement, car les tests valides dépendent de chaque image.

**Badges de mise à jour par conteneur** — Quand l'Image Watcher détecte une mise à jour disponible pour une image de la stack, la page compose indique désormais aussi l'image exacte concernée dans la liste des conteneurs. Le badge au niveau de la stack reste là pour repérer rapidement les stacks à traiter, tandis que la ligne du conteneur affiche un badge compact **MàJ** à côté du nom d'image concerné.

**Actions Recreate des stacks** — Les pages de stack compose ajoutent deux actions avancées avec confirmation dans la barre d'actions : **Recreate** exécute `docker compose up -d --force-recreate --remove-orphans` avec la configuration compose actuelle, tandis que **Pull + recreate** exécute d'abord `docker compose pull` puis recrée les conteneurs de force. Les deux actions passent par le terminal de progression existant, rafraîchissent les métadonnées/statuts de la stack, et gardent l'action **Mettre à jour** disponible pour le workflow pull + up moins disruptif.

**Journal d'audit admin** — Un nouvel onglet **Audit** dans `/watcher` journalise les actions admin sensibles avec utilisateur, date, action, cible, statut et détails : déploiement/sauvegarde/suppression/démarrage/arrêt/redémarrage/recreate/update/down des stacks, suppressions d'images/volumes/conteneurs Docker, prunes images/volumes, changements d'auto-prune, contrôles de rollback/mise à jour d'image, restauration/suppression/vérification de backups et démarrage/arrêt de Kula. La rétention est configurable de 30 jours à **Illimitée**, avec recherche large (par exemple `gluetun`), filtres par action/catégorie/statut, et filtre par date unique ou période.

**Mode Synology / faible consommation** — Un toggle dans **Monitoring → Paramètres d'affichage** réduit drastiquement l'activité de fond pour les NAS et petites configs. Une fois activé, les stats système se rafraîchissent toutes les **30 s** (au lieu de 5 s) et les stats par container/par stack toutes les **60 s** (au lieu de 10 s). Surtout, toute la collecte devient **à la demande** : les commandes lourdes `docker stats` / `docker inspect` ne s'exécutent *que* lorsqu'un client regarde réellement — le polling **se met en pause automatiquement** quand aucun onglet n'est ouvert et quand l'onglet courant est caché (`document.hidden`). Un unique collecteur global côté backend met en cache chaque résultat Docker : tous les clients connectés lisent un cache partagé au lieu de déclencher chacun ses propres requêtes. Le mode s'applique à chaud (sans redémarrage) et est mémorisé entre les sessions.

**Métadonnées de stack sur les pages compose** — Chaque page de stack compose affiche désormais deux indicateurs sous le nom de la stack : **Mis à jour** (temps écoulé depuis la dernière sauvegarde/déploiement du `docker-compose.yml`, en durée relative avec la date complète au survol) et **Relancé** (temps écoulé depuis le dernier démarrage d'un container dans la stack, via `docker inspect`). Mis à jour toutes les 5 secondes avec le statut des services.

**Toggle d'horodatage des logs** — Le bouton **Horodatage** dans la toolbar du terminal de logs active les timestamps ISO 8601 sur chaque ligne de log (`docker compose logs --timestamps`). Le bouton se colore en bleu quand il est actif. Basculer entre les deux modes crée une nouvelle session terminal sans perdre le filtre par service en cours.

**Purge automatique planifiée des images** — Un nouveau panneau **Purge automatique** dans l'onglet Images des Ressources Docker propose deux modes de nettoyage indépendants. Les images **orphelines** (sans tag) sont purgées via `docker image prune -f` selon un planning de 24h, 48h ou 7 jours — aucune exclusion nécessaire, ces images n'ont pas de nom utilisable. Les images **inutilisées** (taguées mais sans conteneur actif) disposent de leur propre planning et d'une liste d'exclusion par `repo:tag` : chaque image inutilisée dans le tableau affiche un bouton **Exclure** qui ajoute son `repo:tag` à une liste persistante, l'empêchant d'être supprimée automatiquement. Un bouton **Lancer** par mode déclenche une purge immédiate. Le résultat du dernier run et le prochain run estimé sont affichés pour chaque mode. Tous les paramètres et exclusions sont persistés entre les redémarrages.

**Exclusions d'alertes crash** — Chaque container dans le tableau des crash events dispose désormais d'un bouton **Ignorer** avec un sélecteur de durée (1h, 6h, 24h, 72h, ou permanent). Les containers exclus sont silencieux dans les alertes et n'apparaissent plus dans la liste. Les exclusions actives s'affichent sous le tableau avec leur date d'expiration et peuvent être retirées individuellement ou toutes en même temps. Un bouton **Effacer la liste** vide les crash events en mémoire. Les exclusions sont persistées entre les redémarrages en base de données SQLite.

**Notifications Apprise par canal** — Les notifications Apprise sont désormais réparties en trois canaux indépendants : **Surveillance images**, **Sécurité (Trivy)** et **Sauvegardes**. Chaque canal dispose de sa propre liste d'URLs Apprise (ex : deux chats Telegram différents et une adresse e-mail), tandis que l'URL du serveur Apprise reste partagée. À configurer séparément dans l'onglet Notifications de `/watcher`.

**Correction du menu de navigation actif** — La page Enhanced (`/watcher`) ne met plus incorrectement **Accueil** en évidence dans le menu de navigation quand on navigue vers la section crash-loop / ressources.

**Logs de stack par service** — Sur chaque page compose, l'en-tête du terminal dispose maintenant d'un sélecteur `Service`. `Tous` garde les logs groupés de la stack, tandis qu'un service précis ouvre un flux filtré dédié, pour lancer, inspecter, arrêter, modifier et relancer un compose sans quitter la page.

**Rollback sans renommage inattendu des conteneurs** — Le rollback d'image et les mises à jour automatiques lancent désormais `docker compose` depuis le dossier de la stack, au lieu de s'appuyer uniquement sur le chemin absolu du compose. Cela évite que Compose déduise un mauvais nom de projet et recrée les conteneurs avec un préfixe inattendu.

**Correction de comparaison des digests ARM64 / Podman** — La surveillance d'images compare maintenant le digest distant à tous les `RepoDigests` locaux, dont le manifest spécifique à la plateforme et le digest d'index multi-arch, tout en évitant les faux positifs quand Docker ou Podman n'expose qu'un ID d'image local/non comparable. L'encart de mise à jour Dockge-Enhanced utilise la même logique, et `DOCKGE_DOCKER_SOCKET` peut pointer vers un socket rootless/Podman personnalisé.

**Historique des mises à jour automatiques** — Un journal horodaté de chaque mise à jour automatique d'image est désormais enregistré et consultable directement dans l'onglet Image Watcher. Chaque entrée indique la date, la stack, le nom de l'image, l'ancien → nouveau digest (tronqué), le mode de mise à jour (Immédiat / Planifié), et le statut succès ou échec. L'historique est persisté entre les redémarrages (`update-history.json`) et peut être effacé en un clic. Les mises à jour échouées sont également enregistrées avec leur message d'erreur.

**Intégration de Kula** — Une nouvelle section **Kula** dans l'onglet Monitoring permet d'activer [kula](https://github.com/c0m4r/kula), un moniteur système léger en Go (CPU, RAM, réseau, I/O disque, containers). Quand activé, Dockge Enhanced pull et démarre automatiquement le container `c0m4r/kula:latest` au démarrage. Configure le port (défaut 27960), le mode réseau (`bridge` avec `-p port:27960`, ou `host` avec `--network host`), et une URL personnalisée optionnelle pour les setups avec reverse proxy. Quand kula tourne, un lien **Kula** apparaît dans la barre de navigation en haut à côté des stats CPU/RAM/disque, et un lien direct est affiché dans l'onglet Monitoring. Le container redémarre automatiquement avec Docker (`--restart unless-stopped`). Kula est optionnel et totalement indépendant de Dockge — il peut être arrêté ou désactivé à tout moment.

> ℹ️ **Pourquoi une stack `kula-dockge-enhanced` apparaît-elle dans la liste comme inactive ?** Quand Kula est activé, Dockge Enhanced écrit un `compose.yaml` minimal dans le répertoire des stacks afin que le **Watcher d'images** puisse surveiller les mises à jour de `c0m4r/kula:latest` au même titre que tes autres images. Le container lui-même est géré via `docker run` (et non `docker compose up`) — c'est intentionnel : Docker Compose v2 injecte un profil AppArmor dans la spec OCI que certains kernels durcis (notamment Synology DSM) ne peuvent pas appliquer, provoquant l'échec du démarrage. Cette entrée de stack inactive est sans conséquence et disparaît quand Kula est désactivé.

**Progression du backup en direct** — Quand tu cliques sur **Lancer un backup maintenant**, une bannière bleue pulsante apparaît sous les boutons et affiche chaque destination en cours avec le temps écoulé (ex : `Local (2m 34s)`). Elle se met à jour chaque seconde et disparaît automatiquement à la fin du backup. Les logs du conteneur affichent désormais des lignes horodatées : `▶ "Local" démarré…` au début et `✓ "Local" terminé en 23m 41s` à la fin — utile pour confirmer qu'un long backup tourne toujours.

**Déverrouillage automatique du repo restic** — Un verrou restic obsolète (code de sortie 11) bloquait auparavant le backup et l'étape `forget --prune`. Dockge Enhanced exécute désormais `restic unlock --remove-all` automatiquement avant chaque opération (démarrage du backup et forget/prune). L'option `--remove-all` est nécessaire quand le verrou provient d'un container différent (ex : après un rebuild Docker qui change l'ID du container) — le simple `unlock` ne supprime que les verrous du même host.

**Correction backup SFTP** — Les backups SFTP en mode mot de passe échouaient avec `parse error on line 1: bare " in non-quoted-field`. Restic utilise le parseur CSV de Go pour lire l'option `-o sftp.command=`, et les arguments entourés de guillemets shell (ex : `"/tmp/fichier"`) provoquaient une erreur de parsing. Corrigé en passant les valeurs brutes sans guillemets shell dans `sftp.command` et `sftp.args` — restic split lui-même la valeur par espace pour construire ses argv.

**Correction du restore test sur gros snapshots** — Sur des dépôts avec 1M+ fichiers (données de volumes incluses), `restic ls` dépassait le buffer de sortie et marquait le restore test en échec. Corrigé en limitant la commande `ls` au répertoire des stacks uniquement (`restic ls <id> /opt/stacks`), réduisant la sortie de ~200 Mo à quelques Ko.

**Patterns d'exclusion restic personnalisés** — Une nouvelle section **Patterns d'exclusion** dans l'onglet Sauvegarde permet d'ajouter des patterns glob passés directement à `restic --exclude` (ex : `*.wal`, `*.tmp`). Les patterns intégrés (`*.log`, `__pycache__`, `node_modules`) sont toujours appliqués. Par ailleurs, le code de sortie 3 de restic ("au moins un fichier source n'a pas pu être lu") est désormais traité comme un **succès avec avertissements** plutôt qu'une erreur — le snapshot est bien créé, et les fichiers qui ont disparu en cours de backup (ex : fichiers WAL de bases de données) sont listés dans la colonne Avertissements au lieu de marquer tout le backup en échec. Le timeout du backup est fixé à **2 heures** pour gérer sereinement les gros dépôts.

**Détail des erreurs de backup dans l'UI** — Lorsqu'une entrée d'historique affiche ✗ Erreur, un clic sur le badge déroule un panneau de détail directement sous la ligne — plus besoin d'aller fouiller les logs ou les notifications. Le message d'erreur complet s'affiche dans un bloc formaté. Si plusieurs destinations sont impliquées, chaque destination en échec est listée séparément avec son nom et son erreur.

**Onglet Monitoring** — Un nouvel onglet **Monitoring** dans le menu Enhanced (`/watcher`) rassemble tout en un écran : **4 cartes de statut** (âge du dernier backup, mises à jour d'images en attente, CVE critiques, prochain scan Trivy), **détection de crash loop** (écoute les événements Docker en temps réel — alerte quand un conteneur redémarre N fois en X minutes, avec cooldown et notifications Discord/Apprise), **auto-heal des healthchecks** (actions optionnelles sur événements Docker `unhealthy`), et les **paramètres d'affichage** (toggle stats par stack et partition disque, déplacés depuis Paramètres → Général).

**Nom d'instance dans les notifications** — Toutes les notifications Discord et Apprise (mises à jour d'images, alertes Trivy, sauvegardes) incluent désormais le nom d'instance configuré dans **Paramètres → Général → Nom d'hôte principal**. Quand il est renseigné, le nom apparaît en préfixe `[mon-serveur]` dans le titre de la notification (Apprise) et dans le footer Discord à côté de l'horodatage. Utile quand tu fais tourner plusieurs instances de Dockge-Enhanced et que tu reçois les notifications dans le même canal.

**Diff entre deux snapshots** — La modal de prévisualisation des fichiers dispose désormais d'un troisième onglet **Diff vs snapshot préc.** en plus de Preview et Diff vs disque. Il affiche un diff ligne à ligne (LCS) entre le fichier tel qu'il était dans le **snapshot précédent** et son contenu dans le **snapshot courant** — exactement les lignes ajoutées ou supprimées entre deux backups. L'onglet est sélectionné automatiquement à l'ouverture d'un fichier portant le badge *Modifié*. Désactivé pour les nouveaux fichiers (pas de version précédente). Utilise le même moteur de diff coloré que le diff vs disque existant.

**Restore test après chaque backup** — Après chaque backup planifié, Dockge Enhanced lit automatiquement un fichier depuis le snapshot fraîchement créé pour vérifier que le repo est réellement lisible — pas juste que restic a dit OK. Il trouve le premier `compose.yaml` dans le snapshot, le déchiffre et le lit en mémoire (aucun fichier temporaire sur le disque), et enregistre le résultat comme ✅ Lisible ou ❌ Échec directement dans le tableau de l'historique des backups. Une icône 🔍 apparaît également à côté de chaque destination dans les notifications Discord/Apprise. Les backups on-save sont ignorés (rapidité). La fonctionnalité peut être désactivée dans l'onglet Backup.

**Exclure une stack du backup** — Une nouvelle section **Stacks à sauvegarder** apparaît dans l'onglet Backup, listant toutes les stacks détectées dans ton dossier compose. Chaque stack dispose d'un toggle — désactive-le pour exclure cette stack de tous les backups (compose.yaml et .env). Les stacks exclues sont affichées avec un badge gris. L'en-tête de la section indique combien de stacks sont exclues lorsqu'elle est réduite. S'applique aux backups planifiés et aux déclenchements on-save.

**Ignorer un CVE spécifique** — Dans le panneau de détails des CVE, chaque ligne de vulnérabilité dispose d'un bouton **⊘**. En cliquant dessus, ce CVE ID est marqué comme ignoré globalement : il disparaît du panneau de détails et est exclu de toutes les notifications Discord/Apprise. Une section **CVEs ignorés** apparaît dans l'onglet de configuration Trivy, listant chaque CVE ignoré avec un bouton **✕** pour reprendre la surveillance individuellement. Les CVEs ignorés sont persistés entre les redémarrages et les scans.

**Backup à la sauvegarde de compose** — À chaque fois qu'une stack est sauvegardée ou déployée depuis Dockge, un snapshot Restic est créé automatiquement — sans attendre le prochain cycle planifié. Cela couvre le `compose.yaml` **et** le `.env` de toutes tes stacks (Restic est incrémental, seul le fichier modifié ajoute des données). Un cooldown de 60 s évite les snapshots en rafale si tu sauvegardes plusieurs fois d'affilée. Point important : les snapshots on-save sont tagués `on-save` et **ne lancent volontairement pas le pruning** (`restic forget`). Cela signifie que les règles de rétention (`keepLast`, `keepDaily`, `keepWeekly`, …) sont uniquement appliquées par le backup cron planifié — une série de sauvegardes dans la journée ne peut donc jamais effacer silencieusement tes anciens snapshots quotidiens ou hebdomadaires. Un toggle dans l'onglet Sauvegarde permet de désactiver la fonctionnalité si tu n'en as pas besoin.

**Ignorer une version spécifique** — Dans la table de statut des images, lorsqu'une mise à jour est disponible, un bouton **Ignorer cette version** apparaît. En cliquant dessus, le digest exact est marqué comme ignoré : plus de notification, plus d'auto-update, l'image affiche "Version ignorée". Un bouton **Reprendre** efface l'ignoré pour que le prochain check reprenne normalement. Permet de passer une release cassée sans désactiver la surveillance de l'image.

**Vérification d'intégrité Restic** — Un nouveau bouton **Vérifier l'intégrité** dans l'onglet Sauvegarde exécute `restic check` sur chaque destination activée indépendamment. Les résultats (✅ OK / ❌ Échec) s'affichent directement avec la sortie complète de restic, sans interférer avec les backups planifiés.

**Parcourir les données de volumes dans les snapshots** — Le visualiseur de snapshots liste désormais les **fichiers de données des volumes** sauvegardés aux côtés des compose/env. Chaque fichier affiche le nom du projet (premier segment de chemin dans le volume), son chemin relatif dans le volume, et les deux mêmes indicateurs de statut que les compose : **vs snapshot précédent** (Nouveau / Modifié / Inchangé) et **vs disque actuel** (OK / Modifié / Absent). Sélectionne n'importe quelle combinaison de fichiers compose, env et volume et restaure-les en un seul clic.

**Protection de l'image de rollback** — L'image de rollback est désormais taguée `dockge-rollback-<clé>:keep` immédiatement après chaque mise à jour automatique, empêchant `docker image prune` (ou tout autre outil) de la supprimer avant l'expiration de la fenêtre de 24 h. Le tag de protection est nettoyé automatiquement lors du rollback ou à l'expiration.

**Badge de fraîcheur du backup** — Un badge `⚠️ Backup en retard` apparaît dans l'en-tête de la section backup lorsque le dernier backup réussi date de plus du double de l'intervalle configuré. Une notification Discord/Apprise est également envoyée une fois par intervalle (FR/EN).

**Date du prochain scan Trivy** — L'en-tête du statut Trivy affiche désormais la date du dernier scan **et** la date du **prochain scan planifié** à côté.

**Restauration par stack** — Chaque tiroir de stack dans le visualiseur de snapshots dispose d'un bouton **Restaurer la stack** en un clic, qui restaure tous les fichiers de cette stack (compose, env et volumes) sans avoir à les sélectionner individuellement.

**Aperçu et diff de snapshot** — Pour les fichiers texte (compose.yaml, .env), un bouton œil ouvre une modale avec deux onglets : **Aperçu** (contenu brut du snapshot) et **Diff vs disque** (diff ligne par ligne LCS montrant exactement ce qu'une restauration changerait — les lignes en rouge disparaîtront, les lignes en vert seront ajoutées).

**Image Watcher** — Vérifie automatiquement les mises à jour d'images en comparant les digests locaux et distants (sans pull). Supporte Docker Hub, ghcr.io, les registries privés, et les stacks avec `network_mode: host`, réseaux externes ou ancres YAML. Fréquence configurable (1h → 24h). **Màj automatique par image** : choisis *Immédiat* pour màj dès la détection, *Planifié* pour appliquer à une heure précise (ex : `02:00` — utilise le fuseau `TZ` du conteneur), ou *Ignorer* pour ne jamais vérifier cette image. Un indicateur ⏳ signale les images en attente. **Rollback** : après chaque mise à jour automatique, une fenêtre de 24 h s'ouvre — un compte à rebours et le bouton Rollback apparaissent dans le tableau ; l'ancienne image est purgée automatiquement à l'expiration. Les notifications distinguent ✅ màj auto effectuée, 🕐 planifiée à HH:MM et 🔄 action manuelle requise — par image. Clique sur **Voir le projet →** à côté de chaque image pour la rechercher instantanément.

**Trivy Scanner** — Scanne les images des conteneurs en cours d'exécution pour des vulnérabilités connues (CVE) via [Trivy](https://trivy.dev/). `aquasec/trivy:latest` est automatiquement pull avant chaque scan et supprimée après — toujours à jour, aucune place occupée entre les scans. Seuil d'alerte et timeout de scan configurables. Résultats visibles dans l'UI avec un bouton de scan manuel par image. Déduplication des CVE (chaque vulnérabilité n'apparaît qu'une seule fois par image). Alertes envoyées sur Discord/Apprise avec retry/backoff en cas de rate limit.

**Backup Restic** — Sauvegarde automatique des `compose.yaml`, `.env` et volumes de chaque stack avec [Restic](https://restic.net/), avec un mode de cohérence individuel : à chaud, arrêt/redémarrage ou hooks applicatifs. **Plusieurs destinations en parallèle** — ajoutes-en autant que tu veux (ex : local + SFTP) et toutes sont sauvegardées à chaque exécution. 4 types de destination : local, SFTP/NAS (tout port, clé SSH ou mot de passe, `sshpass` intégré), S3/Backblaze B2, REST Server. **Backup des volumes** : inclus optionnellement `/app/data` (données Dockge) et/ou autant de **chemins personnalisés** que tu veux (ex : `/dockers-data`) — les tailles sont calculables et affichées à la demande. Politique de rétention configurable. La date du prochain backup est affichée. **Visualiseur de snapshots** : clique sur un snapshot pour le dérouler et parcourir les fichiers compose/env *et les données de volumes* côte à côte. Les fichiers de volumes affichent le nom du projet et leur chemin relatif dans le volume. Chaque fichier dispose de deux indicateurs : **vs snapshot précédent** (Nouveau / Modifié / Inchangé) et **vs disque actuel** (OK / Modifié / Absent). Sélectionne n'importe quelle combinaison et restaure en un clic.

**Notifications Discord** — Embeds colorés pour les mises à jour d'images, alertes sécurité et résultats de backup. Plusieurs webhooks supportés par fonctionnalité. Définis `DOCKGE_PUBLIC_URL` pour inclure un lien cliquable dans les notifications. Retry automatique avec backoff exponentiel en cas de rate limit (HTTP 429) ou d'erreur serveur.

**Notifications Apprise** — Envoie les alertes vers 60+ services (Telegram, ntfy, Slack, Gotify, Pushover, Matrix…) via un conteneur [Apprise](https://github.com/caronc/apprise-api). Configuré une fois dans `/watcher` (section rétractable) et s'applique à tous les types d'alertes. Passe les URLs directement (mode stateless) ou laisse Apprise utiliser ses services pré-configurés. Fonctionne en parallèle de Discord.

**Ressources Docker** — Liste et suppression des images, volumes et conteneurs non gérés depuis l'UI (`/resources`). L'onglet **Hors Dockge** liste les conteneurs qui tournent en dehors de Dockge — arrête-les et supprime-les directement depuis l'interface. Deux modes de purge d'images : **Orphelines** (`docker image prune`) pour les images sans tag uniquement, et **Inutilisées** (`docker image prune -a`) pour toutes les images non utilisées par un conteneur actif. Met en évidence les images/volumes liés à des stacks arrêtées, avec double confirmation. Le badge MàJ des stacks disparaît automatiquement une fois les images à jour. **Cases à cocher multi-sélection** pour supprimer plusieurs images en un seul clic.

**Stats système & par stack** — CPU, RAM et espace disque affichés dans la barre de navigation (mis à jour toutes les 5 s), avec indicateurs couleur pastel (vert → jaune → rouge). La consommation CPU% et RAM de chaque stack est affichée à côté de son nom dans la liste (mis à jour toutes les 10 s, via un seul appel `docker stats --no-stream`). Activable/désactivable depuis l'onglet **Monitoring**. La partition disque surveillée est configurable depuis ce même onglet.

**Monitoring** — Un onglet **Monitoring** dédié dans le menu Enhanced (`/watcher`) centralise tout : **cartes de vue d'ensemble** (âge du dernier backup, mises à jour d'images en attente, CVE critiques, prochain scan Trivy), **détection de crash loop** (flux d'événements Docker en temps réel — alerte quand un conteneur redémarre N fois en X minutes, avec cooldown), **auto-heal des healthchecks** (notification, redémarrage conteneur, redémarrage service, ou mode intelligent stack-aware), et les paramètres d'affichage (stats par stack, partition disque).

**Interface FR/EN** — Les pages `/watcher` et `/resources` disposent d'un bouton 🇫🇷/🇬🇧 pour changer la langue indépendamment du paramètre global de l'application.

**Navigation mobile** — Barre de navigation bas complète sur mobile avec toutes les sections : Accueil, Console, Surveillance, Ressources, Paramètres.

---

## Captures d'écran

<table>
  <tr>
    <td align="center" width="33%">
      <a href="screens/LandingPage.png"><img src="screens/LandingPage.png" width="100%"/></a>
      <sub>Landing page — vue d'ensemble</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/Images.png"><img src="screens/Images.png" width="100%"/></a>
      <sub>Gestion des images Docker</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/Sécurité.png"><img src="screens/Sécurité.png" width="100%"/></a>
      <sub>Trivy Scanner — sécurité & CVE</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/Sauvegarde.png"><img src="screens/Sauvegarde.png" width="100%"/></a>
      <sub>Backup Restic — snapshots</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/Ressources.png"><img src="screens/Ressources.png" width="100%"/></a>
      <sub>Ressources Docker — CPU, RAM & stockage</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/Notifications.png"><img src="screens/Notifications.png" width="100%"/></a>
      <sub>Centre de notifications</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/Monitoring.png"><img src="screens/Monitoring.png" width="100%"/></a>
      <sub>Monitoring temps réel des stacks</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/EnhancedUpdate.png"><img src="screens/EnhancedUpdate.png" width="100%"/></a>
      <sub>Mise à jour in-app de Dockge Enhanced</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordUpdates.png"><img src="screens/DiscordUpdates.png" width="100%"/></a>
      <sub>Discord — alertes de mises à jour d'images</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/DiscordTrivy.png"><img src="screens/DiscordTrivy.png" width="100%"/></a>
      <sub>Discord — alertes sécurité Trivy</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordBackup.png"><img src="screens/DiscordBackup.png" width="100%"/></a>
      <sub>Discord — notifications de sauvegarde</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordEnhancedUpdate.png"><img src="screens/DiscordEnhancedUpdate.png" width="100%"/></a>
      <sub>Discord — alertes de mise à jour Dockge Enhanced</sub>
    </td>
  </tr>
</table>

---

## Installation

```yaml
# compose.yaml
services:
  dockge:
    image: ghcr.io/aerya/dockge-enhanced:latest
    container_name: dockge-enhanced
    restart: unless-stopped
    ports:
      - 5001:5001
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ../../data:/app/data
      - ../../opt/stacks:/opt/stacks
      - ../../backup/dockge:/backup          # optionnel — volume dédié au backup local
      - ../../docker:/dockers-data           # optionnel — données supplémentaires à sauvegarder
    environment:
      - DOCKGE_STACKS_DIR=/opt/stacks
      - DOCKGE_DATA_DIR=/app/data
#      - DOCKER_API_VERSION=x.xx             # optionnel — pour les NAS avec une API Docker ancienne
      - TZ=Europe/Paris                      # fuseau horaire (affecte les MàJ planifiées)
```

```bash
docker compose up -d
```

Ouvre **http://localhost:5001**, crée ton compte admin, puis clique sur **Surveillance** dans la barre de navigation.

> Le volume `/backup:/backup` est optionnel mais recommandé si tu utilises **local** comme destination Restic — pointe la destination sur `/backup` pour que les snapshots atterrissent dans un répertoire dédié sur l'hôte, hors du container.

> **Tu veux sauvegarder plusieurs répertoires de données ?** Ajoute autant de volumes que nécessaire (ex : `../../media:/media-data`), puis enregistre chaque chemin dans l'onglet Backup sous **Chemins supplémentaires** — Restic les inclura tous à chaque exécution.

> **Tu veux surveiller une partition autre que `/` ?** Les stats disque sont lues depuis l'intérieur du container via `df`. Pour surveiller un chemin hôte comme `/mnt/data`, monte-le en lecture seule et ajoute-le dans l'onglet **Monitoring** sous *Partitions disque surveillées* :
> ```yaml
>       - /mnt/data:/mnt/data:ro
> ```

---

## Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `DOCKGE_STACKS_DIR` | `/opt/stacks` | Dossier contenant les stacks Docker Compose |
| `DOCKGE_DATA_DIR` | `/opt/dockge/data` | Dossier de données Dockge (à définir sur `/app/data`) |
| `DOCKGE_PUBLIC_URL` | *(aucun)* | URL publique utilisée dans les liens des notifications Discord (ex : `https://dockge.mondomaine.fr`) |
| `DOCKER_API_VERSION` | *(aucun)* | Fixe la version d'API Docker négociée par le client — utile sur certains NAS (ex : Synology DSM 7.x) |
| `TZ` | `UTC` | Fuseau horaire du container — **important** pour que les MàJ planifiées se déclenchent à la bonne heure locale (ex : `Europe/Paris`) |
| `DOCKGE_PORT` | `5001` | Port de la WebUI |
| `DOCKGE_SSL_KEY` / `DOCKGE_SSL_CERT` | — | Activer HTTPS |
| `DOCKGE_AUTH_MODE` | *(non défini)* | Mode d’authentification : `local`, `disabled` ou `trusted-proxy`. Non défini, le comportement historique et le réglage `disableAuth` sont conservés |
| `DOCKGE_AUTH_PROXY_HEADER` | `x-forwarded-user` | Header contenant l’identité validée par le proxy en mode `trusted-proxy` |
| `DOCKGE_AUTH_PROXY_TRUSTED_NETWORKS` | *(requis en mode proxy)* | Adresses ou CIDR autorisés à fournir le header d’identité, séparés par des virgules |
| `DOCKGE_BOOTSTRAP_USERNAME` | *(aucun)* | Nom du premier administrateur à créer uniquement si la base ne contient encore aucun utilisateur |
| `DOCKGE_BOOTSTRAP_PASSWORD_FILE` | *(aucun)* | Fichier secret contenant son mot de passe ; recommandé pour un bootstrap automatisé |
| `DOCKGE_BOOTSTRAP_PASSWORD` | *(aucun)* | Alternative directe au fichier secret, moins sûre car visible dans l’environnement du conteneur |

> ⚠️ Toujours définir `DOCKGE_DATA_DIR=/app/data` pour correspondre au montage de volume, sinon les paramètres ne seront pas persistés après un redémarrage.

> ℹ️ `DOCKGE_PUBLIC_URL` est optionnel. Si absent, les notifications Discord sont envoyées sans lien. Compatible avec les reverse proxies et les domaines HTTPS.

### Authentification et premier setup

**Installation existante : rien à changer.** Sans les variables ci-dessus, les comptes, la page de connexion, la 2FA et le réglage **Désactiver l’authentification** fonctionnent comme avant. Au premier démarrage d’une installation neuve, ouvre simplement `/setup` et crée l’administrateur. Une fois l’installation terminée, le serveur refuse toute nouvelle tentative de setup, même si l’URL SPA reste connue.

Pour un bootstrap non interactif, monte de préférence un secret puis renseigne uniquement ces variables optionnelles :

```yaml
services:
  dockge:
    environment:
      - DOCKGE_BOOTSTRAP_USERNAME=admin
      - DOCKGE_BOOTSTRAP_PASSWORD_FILE=/run/secrets/dockge_admin_password
    secrets:
      - dockge_admin_password

secrets:
  dockge_admin_password:
    file: ./secrets/dockge_admin_password
```

Le bootstrap est ignoré dès qu’un utilisateur existe : il ne modifie ni mot de passe ni compte sur une installation déjà initialisée.

Pour déléguer l’accès à [OAuth2 Proxy](https://oauth2-proxy.github.io/oauth2-proxy/configuration/overview/) ou à Traefik ForwardAuth :

```yaml
environment:
  - DOCKGE_AUTH_MODE=trusted-proxy
  - DOCKGE_AUTH_PROXY_HEADER=x-forwarded-user
  - DOCKGE_AUTH_PROXY_TRUSTED_NETWORKS=172.20.0.0/24
```

Remplace le CIDR d’exemple par le réseau exact de ton proxy et configure celui-ci pour transmettre le header choisi. Le port Dockge ne doit pas être accessible directement : seuls les proxies déclarés peuvent fournir une identité. Tous les utilisateurs autorisés par le proxy disposent des droits administrateur dans Dockge Enhanced, qui ne propose pas encore de rôles distincts. Ne place jamais `/setup`, `/socket.io` ou `/api/*` dans une règle sans authentification ; le proxy doit transmettre les WebSockets et protéger tout le host.

---

## Mises à jour automatiques

Ce fork suit les releases stables de Dockge automatiquement via GitHub Actions :
- **Chaque jour** — vérifie si une nouvelle version est disponible
- **Si oui** — merge les changements upstream et crée une PR
- **Au merge** — rebuild et publie les images Docker (`amd64` + `arm64`) sur GHCR
- **En cas de conflit d’authentification** — conserve temporairement la version Enhanced dans la branche de synchronisation et signale explicitement les fichiers à comparer avant le merge

---

## Applications mobiles / clients tiers

Dockge-Enhanced est libre et open-source.

Il n'existe pas d'application iOS ou Android officielle maintenue par ce projet.

Des clients tiers peuvent exister, mais ils sont indépendants de Dockge-Enhanced sauf mention explicite ici.

---

## Attribution

Si votre application, service, article ou intégration utilise des fonctionnalités, endpoints API, captures d'écran, documentation ou la marque de Dockge-Enhanced, merci de créditer le projet et de lier vers ce dépôt.

Les clients tiers commerciaux sont autorisés par la licence, mais ne doivent pas laisser entendre une affiliation officielle sans autorisation.

---

## Crédits

- [**Dockge**](https://github.com/louislam/dockge) par louislam — le projet d'origine (licence MIT)
- [**Trivy**](https://github.com/aquasecurity/trivy) — scanner de vulnérabilités
- [**Restic**](https://restic.net/) — outil de backup chiffré
- [**Apprise**](https://github.com/caronc/apprise-api) — passerelle de notifications multi-plateformes
- [**Kula**](https://github.com/c0m4r/kula) par c0m4r — monitoring système léger (AGPLv3)

---

## Licence

MIT — voir [LICENSE](LICENSE).
