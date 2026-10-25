<p align="center">
  <img src="https://raw.githubusercontent.com/Aerya/Dockge-Enhanced/main/frontend/public/icon.svg" width="120" alt="Dockge Enhanced logo">
</p>

# Dockge Enhanced

Dockge Enhanced est un fork de [Dockge](https://github.com/louislam/dockge) pour administrer vos environnements Docker Compose depuis une interface web, sur un ou plusieurs serveurs. Il réunit la gestion des stacks et des conteneurs, la recherche globale et l’accès aux fichiers, la migration et la réplication, les sauvegardes avec Restic ou Zerobyte, les mises à jour avec rollback, ainsi que la supervision, les contrôles de sécurité et l’automatisation. Ses intégrations et ses outils de récupération permettent de suivre et de maintenir vos services au quotidien.

<p align="center">
  🇫🇷 Français ·
  🇬🇧 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.md">English</a> ·
  🇪🇸 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.es-ES.md">Español</a> ·
  🇨🇳 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.zh-CN.md">简体中文</a> ·
  🇩🇪 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.de.md">Deutsch</a> ·
  <a href="https://upandclear.org/2026/08/30/dockge-enhanced-quelques-mois-plus-tard-le-petit-fork-a-bien-grandi/">Article de présentation</a>
</p>

<p align="center">
  <img src="https://github.com/Aerya/Dockge-Enhanced/actions/workflows/build-publish.yml/badge.svg?branch=main" alt="Build">
  <img src="https://img.shields.io/badge/arch-amd64%20%7C%20arm64-lightgrey" alt="multi-arch">
  <img src="https://img.shields.io/badge/i18n-EN%20%7C%20FR%20%7C%20ES%20%7C%20DE%20%7C%20zh--CN-blue" alt="i18n">
  <img src="https://img.shields.io/badge/based%20on-Dockge-orange?logo=github&logoColor=white" alt="based on Dockge">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
</p>

<p align="center">
  <strong>Vous l'utilisez ? Vous l'appréciez ?</strong>
  <a href="https://github.com/Aerya/Dockge-Enhanced"><strong>⭐ Ajoutez une étoile !</strong></a>
  — ça prend deux secondes.
</p>

---

## Fonctionnalités

### Ce qui distingue Dockge Enhanced

| Domaine | Dockge Enhanced ajoute |
| --- | --- |
| **Multi-serveurs** | Fédération en maillage complet entre instances Dockge-Enhanced, administration depuis n'importe quel serveur lié, connexions inversées facultatives avec jeton par nœud, tags d’agents persistants, sélection et regroupement des serveurs, état des mises à jour distantes, copie/migration transactionnelle des stacks, transferts reprenables et réplication froide planifiée |
| **Gestion des stacks** | Stacks épinglées, indicateurs compacts d'état et de ressources, navigation repliable/redimensionnable, espace Logs/Compose flexible, barre d’actions directement accessible en mode icônes seules ou icônes avec texte, actions de stack/conteneur expliquées, pause/reprise des stacks, planification par conteneur, Build + Recreate, notes, outils Git, prérequis de démarrage hôte et recréation automatique des services partageant un namespace réseau VPN |
| **Édition Compose** | Éditeurs Compose, override et `.env`, modèles Compose et `.env` par défaut, liens nommés, réparation du YAML, assistant de healthcheck par service, contrôles des conflits de ports et des écarts d’image, et `TZ` facultatif par stack; limites CPU/RAM facultatives par service (Préparé dans cette PR ; pas encore publié.) |
| **Sauvegarde & reprise** | Sauvegardes Restic multi-destination des bind mounts et volumes, cohérence par stack, restauration sélective, vérification des dépôts, contrôle et diff des snapshots, réinitialisation sécurisée des dépôts, ainsi que les mécanismes de récupération utilisés par les mises à jour protégées. Connexion Zerobyte facultative ou installation gérée, workflows applicatifs protégés et restaurations de test dédiées |
| **Mises à jour** | Réglages groupés par stack avec conservation des exceptions, contrôle ciblé toutes les 5 minutes en mode Immédiat, respect des images ignorées avant toute modification, mises à jour manuelles, groupées séquentielles ou automatiques des conteneurs avec rollback, créneau de maintenance commun, badges distants, pauses globales/par image et auto-mise à jour protégée de Dockge-Enhanced avec backup obligatoire, contrôles d'intégrité et récupération automatique |
| **Migration & réplication** | Transferts transactionnels entre instances, migration du Compose et des données persistantes, jobs reprenables, finalisation explicite des déplacements, répliques froides planifiées, snapshots de récupération et workflows de reprise |
| **Sécurité & authentification** | Comptes locaux limités avec permissions par stack et par service, 2FA TOTP facultative, connexion OIDC native, authentification par trusted proxy, Cloudflare Turnstile, scan de vulnérabilités Trivy, exceptions CVE et workflows de mise à jour protégés |
| **Supervision** | Statistiques système, stacks et conteneurs, historique CPU/RAM facultatif toutes les 5 minutes, barre d'état configurable, cartes de santé, crash loops, auto-heal, logs responsives/plein écran, et intégrations facultatives Kula, Dozzle, PowerWatch et PowerWatch Hub |
| **Ressources Docker** | Nettoyage unifié protégé des images, volumes, réseaux et caches de build, rattrapage exact, aperçu, exclusions, historique et protections destructives |
| **Recherche & fichiers** | Recherche globale multi-instance, gestionnaire de fichiers hôte restreint, navigation dans les volumes, transferts par morceaux, édition de texte et lecture de fichiers journaux |
| **Stacks externes** | Détection et intégration des projets Compose existants, autorisation de leurs chemins et inspection des conteneurs réels sans déplacer les données |
| **Automatisation & audit** | API REST limitée par permissions, webhooks par stack, intégration Home Assistant, opérations planifiées et historique centralisé avec origine, statut et durée |
| **Intégrations** | Zerobyte, PowerWatch et PowerWatch Hub, PlugNPiN et assistant de labels par service pour Nginx Proxy Manager, Pi-hole et AdGuard Home, Dozzle, Kula et Home Assistant |
| **Apparence** | Palettes jour/nuit, thèmes intégrés, préférences par navigateur et actions de stack en icônes seules ou avec texte |
| **Notifications & accès** | Notifications Discord et Apprise localisées en EN/FR/ES/zh-CN, prise en compte du multi-instance, annonces distantes et clients mobiles tiers |

## Dernières nouveautés

<details>
<summary>Afficher les dernières nouveautés</summary>

Les évolutions majeures récentes sont regroupées ici afin de comprendre rapidement ce qui vient d'arriver dans Dockge-Enhanced.

### 🆕 Octobre 2026

**Connexion OIDC native :** connectez-vous avec un fournisseur OpenID Connect comme Pocket ID, Authentik, Keycloak ou Google, sans reverse proxy et en plus des comptes locaux et de la 2FA. La configuration passe par les variables d’environnement `DOCKGE_OIDC_*` et le flux Authorization Code avec PKCE. Les nouveaux utilisateurs OIDC sont des comptes limités sans aucun accès tant qu’un administrateur ne leur en donne pas, sauf s’ils figurent dans `DOCKGE_OIDC_ADMIN_USERS` ou appartiennent à `DOCKGE_OIDC_ADMIN_GROUPS` ; avec des groupes admin, le rôle suit l’appartenance au groupe à chaque connexion. Aucun « premier utilisateur administrateur » implicite : sur une installation neuve, créez d’abord l’administrateur ou configurez une correspondance admin. Un compte local existant n’est rattaché qu’avec `DOCKGE_OIDC_LINK_EXISTING=true`. Les connexions OIDC ne demandent pas le code TOTP local, et l’OIDC est ignoré en modes `disabled` et `trusted-proxy`. Si vous activez `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN=true`, gardez la procédure de récupération à portée de main. [Guide](docs/oidc.fr.md).

**Nom du fichier Compose par défaut :** Préparé dans cette PR ; pas encore publié. COMPOSE_FILENAME choisit compose.yaml (par défaut), compose.yml, docker-compose.yaml ou docker-compose.yml uniquement pour les nouvelles stacks. Les stacks existantes et adoptées conservent leurs fichiers. Les autres noms et chemins sont refusés.

**Ports Socket.IO par défaut :** Préparé dans cette PR, pas encore publié. Une origine navigateur utilisant le port HTTP/HTTPS implicite correspond désormais à un en-tête Host avec :80/:443 explicite, y compris en IPv6. Les hôtes et ports non équivalents restent refusés ; les en-têtes de proxy ne contournent pas ce contrôle.

**Limites CPU/RAM par service :** Préparé dans cette PR ; pas encore publié. Limites CPU/RAM facultatives par service dans l’éditeur Compose administrateur. Les alias existants restent cohérents ; les autres réglages de ressources et les droits des comptes limités sont préservés. Appliquez au brouillon, puis enregistrez et déployez explicitement. Inspiration : Isurupro7 (Dockge #1006). Une limite RAM trop basse peut arrêter le conteneur par manque de mémoire. Le CPU est bridé. Retirer une limite ne réserve aucune ressource. Les expressions existantes sont conservées tant qu’elles ne sont pas modifiées. Les autres réglages de ressources restent inchangés. Les overrides, extends ou fichiers inclus peuvent encore fournir des limites : vérifiez le Compose final. Un avertissement RAM bien visible exige une confirmation avant d’appliquer une nouvelle limite mémoire ou de la modifier.

**Respect des images ignorées :** ImageWatcher revérifie **Ignorer** après le contrôle du registre, avant le téléchargement puis juste avant la recréation des conteneurs, y compris pour les mises à jour planifiées déjà sélectionnées et le conteneur Dozzle géré. Les anciens candidats des lots manuels sont également bloqués. Un téléchargement déjà commencé peut se terminer, mais aucune recréation ne suit ; une recréation Docker déjà lancée n’est pas interrompue.

**Comptes locaux à accès limité :** Dans **Paramètres → Sécurité → Utilisateurs et permissions**, créez des comptes limités et choisissez, pour chaque stack locale ou liée, les droits de consultation, journaux, démarrage, arrêt, redémarrage, mise à jour et recréation. Sans sélection, aucun accès. Les comptes existants restent administrateurs. L’interface dédiée ne donne accès ni au Compose/.env, ni au terminal, fichiers, suppressions, sauvegardes ou réglages. Mettez à jour les deux extrémités des instances liées, y compris les agents inversés ; aucun contournement pour un ancien agent. Les droits sont liés au couple instance/nom de stack : réexaminez-les si vous réutilisez un nom. La révocation ferme les sessions mais n’annule pas une opération Docker déjà engagée. Les journaux peuvent contenir des secrets. Authentification locale, avec droits facultatifs par service couvrant ses réplicas malgré les recréations. Chaque utilisateur gère son mot de passe, sa 2FA et ses codes de secours ; l’administrateur peut réinitialiser la 2FA ou supprimer le compte seul. Une action par service touchant des dépendants réseau est refusée ; un démarrage délégué ne démarre pas ses dépendances. Avec l’authentification par trusted proxy, chaque identité du proxy utilise le compte local du même nom ; une identité inconnue est créée comme compte limité sans droits, sauf le premier utilisateur d’une installation neuve et les identités listées dans `DOCKGE_AUTH_PROXY_ADMIN_USERS`. [Détails techniques](docs/scoped-users.md).

**Modèles Compose et agents distants :** Liens HTTP/HTTPS nommés, modèle .env par défaut configurable, tags persistants des agents et filtrage par tag, ainsi que connexions inversées facultatives avec jetons individuels et rattachement automatique après initialisation du compte local. Les agents inversés appartiennent à leur serveur central ; les transferts de données interserveurs nécessitent toujours une fédération directe. Un compte administrateur local existant suffit : aucun nouveau compte à créer. [Documentation](docs/compose-and-reverse-agents.fr.md).

**Liens de ports :** Choisissez Nom d’hôte ou Adresse IP pour les liens de ports des conteneurs dans Paramètres → Général. Chaque instance liée conserve son choix ; le comportement par défaut est préservé. Le mode Nom d’hôte privilégie le Nom d’hôte principal, puis l’adresse du navigateur/de l’agent. Le mode IP utilise une IP connue ou une IPv4/IPv6 explicite joignable. Sans IP connue, le badge reste visible sans lien avec une infobulle explicative. Configurez chaque instance hébergeuse séparément et mettez les deux côtés à jour pour transmettre ce choix en fédération ; les anciens agents gardent leur comportement. Ports Docker, DNS et noms d’hôte enregistrés restent inchangés.

**Sécurité TLS et mises à jour de sécurité :** Mise à jour des certificats et des composants TLS des images après l’incident eMudhra. Les contrôles couvrent les chaînes compromises, dont les deux cas « No CT », et une connexion HTTPS valide. Une image déjà en cours d’exécution reste inchangée : son remplacement doit être planifié après validation. L’image passe également à Node.js 26.12.1 pour les correctifs de sécurité Node.js d’octobre 2026, et `follow-redirects` ainsi que la version de Restic embarquée reçoivent des correctifs de sécurité. [Détails de l’incident](https://emudhra.we-have-a-problem.com/) · [Contrôles TLS](security/emudhra/README.md)

**Contrôles Compose et Home Assistant :** Avertissements de conflits de ports avant enregistrement/déploiement, avec résolution des variables, overrides et plages ; comparaison des références d’images exécutées et correction du YAML à vérifier. Intégration Home Assistant facultative avec capteurs d’état et commandes démarrer/arrêter/redémarrer limitées par permissions. [Guide](docs/HOME-ASSISTANT.md).

**Instance / Global :** Accueil : statistiques de l’instance en premier, puis totaux globaux indépendants des filtres des stacks. Chaque carte de résumé propose un détail par instance avec des liens directs vers ses menus. Les instances hors ligne ou anciennes sont signalées comme indisponibles ; le bilan des sauvegardes distingue les instances désactivées.

**Statut des stacks détectées :** Les projets Compose détectés mais non adoptés, comme ceux de DDEV, ne provoquent plus d’erreurs `spawn docker ENOENT` répétées lorsque leur dossier est absent de la racine des stacks. Le statut des stacks externes adoptées utilise leur dossier, leur nom de projet et leurs fichiers Compose enregistrés.

**Authentification TOTP à deux facteurs facultative :** Activez-la dans **Paramètres → Sécurité → Paramètres 2FA** avec votre mot de passe actuel, scannez le QR code et confirmez un code de votre application d’authentification. Enregistrez les dix codes de secours à usage unique : ils ne sont affichés qu’une fois. Désactivée par défaut, cette protection concerne la connexion locale, pas l’authentification par proxy ni les jetons de fédération. Avant d’activer la 2FA, utilisez des jetons de fédération pour les instances liées ; les connexions par mot de passe seul ne fonctionneront plus.

Sauvegardez tout `/app/data`, y compris `two-factor.key`. Une restauration de la base seule ne permet pas de déchiffrer le secret sans cette clé. En cas de perte de l’application et de tous les codes de secours, un administrateur ayant accès au conteneur peut lancer `./node_modules/.bin/tsx ./extra/reset-two-factor.ts --username ACCOUNT --confirm` depuis `/app`, puis redémarrer Enhanced ; le mot de passe est conservé.

**Historique CPU/RAM par service Compose :** Activez l’enregistrement dans **Monitoring**, puis ouvrez **Consommation** dans les actions d’une stack. Les graphiques compacts présentent le total de la stack et un historique par service Compose, y compris pour les projets Compose non gérés. Les mises à jour et recréations restent dans le même historique ; les réplicas simultanés sont additionnés à chaque mesure avant le calcul des moyennes et maxima. Les mesures existantes sont conservées sans réinitialisation. Périodes : 24 heures, 7 jours, 1 mois, 1 an ou toutes les données enregistrées. L’enregistrement est désactivé par défaut et collecte une mesure toutes les 5 minutes, même sans navigateur ouvert. Pour le CPU, 100 % correspond à un cœur ; sous Linux, la RAM exclut le cache récupérable. Les interruptions restent visibles et les pics entre deux mesures peuvent être manqués. Les totaux excluent les processus natifs de l’hôte et les conteneurs hors Compose. Le tri CPU/RAM reste disponible dans la liste des stacks.

**Sauvegardes avec Zerobyte :** connectez une instance existante ou installez une instance Compose dédiée depuis **Sauvegardes → Zerobyte**. Utilisez-la en complément de Restic natif ou pour vos sauvegardes planifiées, avec des dépôts distincts. L’intégration propose un assistant de configuration, des workflows protégés d’arrêt/redémarrage des applications, des contrôles du stockage, des restaurations de test dédiées et une supervision multi-serveurs en lecture seule. Un stockage réseau indisponible bloque la sauvegarde sans repli local. [Guide de configuration et de reprise](docs/zerobyte.fr.md).

**Éviter de sauvegarder les sauvegardes Restic :** lorsqu’un dépôt local se trouve dans un dossier sélectionné, Enhanced vous avertit et l’exclut automatiquement. Par exemple, vous pouvez conserver `/app/data` comme source avec un dépôt dans `/app/data/backups`. Sélectionner le dépôt lui-même ou un de ses sous-dossiers comme source est refusé. Les chemins, mots de passe et réglages de rétention existants sont conservés.

**Assistant de healthcheck facultatif par service :** cliquez sur **Configurer le healthcheck** sur un service d’une stack existante ou pendant la création. L’assistant propose un contrôle par URL HTTP locale ou port TCP selon les ports internes Compose. Vérifiez ou modifiez la cible et la commande exacte avant de l’ajouter au YAML ; les healthchecks existants ne sont jamais remplacés automatiquement. Le test s’exécute dans l’image, qui doit fournir `/bin/sh` et `curl`/`wget` ou `nc`. Vérifiez l’état de santé après déploiement ; un port TCP ouvert ne garantit pas que l’application est prête.

En mode édition du Compose, l’action **Healthchecks** figure aussi dans la barre d’actions de la stack. Choisissez le service si la stack en comporte plusieurs.

#### Mises à jour et ImageWatcher

**Fuseau des planifications et TZ facultatif des conteneurs :** Choisissez le **Fuseau horaire des planifications** dans **Paramètres → Général**. Il pilote les horaires de démarrage/arrêt des stacks, les mises à jour d’images, les créneaux de mise à jour interne et les crons Restic natif et d’analyse de sécurité de cette instance. Sans choix explicite, le fuseau actuel du processus est conservé ; les heures enregistrées ne sont pas réécrites. Les instances liées et les outils externes comme Zerobyte conservent leurs propres réglages. Les intervalles relatifs, échéances de pause et rétentions ne changent pas. Le changement d’heure suit le fuseau choisi : une heure inexistante n’est pas garantie d’être exécutée et une heure répétée peut survenir deux fois ; préférez un horaire hors transition, comme 04:00.

Dans les actions d’édition d’une stack, **Fuseau des conteneurs** propose une option **désactivée par défaut** pour ajouter `TZ` au brouillon Compose et à son override. Les valeurs existantes, héritées ou susceptibles de venir d’un `env_file`/`extends` nécessitent une confirmation. Vérifiez le YAML, enregistrez puis recréez/déployez pour appliquer. Les images doivent prendre en charge `TZ` ; les fichiers `.env`/`env_file` ne sont pas modifiés, et un futur changement du fuseau global ne réécrit ni ne recrée automatiquement les stacks.

**Notifications des mises à jour d’images :** Discord et Apprise n’annoncent qu’une fois une mise à jour en attente pour une même stack, image et digest distant, y compris lorsqu’elle attend son créneau planifié. Ce suivi est conservé après redémarrage d’Enhanced. Un nouveau digest est annoncé à nouveau ; les résultats des mises à jour automatiques conservent leur propre notification. Les envois échoués sont retentés aux contrôles suivants, indépendamment pour chaque webhook Discord et la destination Apprise configurée.

**Les services arrêtés restent arrêtés :** une mise à jour automatique d’image est reportée si un service Compose ciblé, y compris un compagnon de namespace réseau requis, est arrêté ou absent. ImageWatcher revérifie après le téléchargement, avant la recréation, puis réessaie lors d’un contrôle ultérieur. Il n’utilise pas `compose up` pour réveiller un service arrêté.

**Fréquences de vérification :** dans **Watcher > Images**, le scan général couvre toutes les images toutes les **6 h par défaut**. Les images en mode **Immédiat** bénéficient en plus d’un contrôle ciblé toutes les **5 min par défaut**. Cet intervalle ciblé peut être défini en minutes ou en heures (de 5 min à 24 h), ou désactivé seul : le scan général reste actif. Sélectionner le mode Immédiat peut toujours déclencher un contrôle ciblé ponctuel.

**Préparation des montages hôte sous macOS**

Avant de démarrer ou de mettre à jour une stack, Enhanced demande à Docker de préparer directement chaque dossier source d’un bind mount. Cela couvre aussi les chemins partagés par Docker Desktop sous macOS, comme `/Users/...`, sans supposer qu’un montage de `/` donne accès au système de fichiers macOS. Les montages de fichiers comme `/etc/localtime` ne sont pas créés comme dossiers. Si Docker ne peut pas accéder à un chemin source, l’opération s’arrête avec son erreur réelle ; vérifiez que le dossier est partagé avec Docker Desktop.

**Espace disque et conservation des anciennes images Enhanced**

Avant le backup ou le téléchargement, l’auto-mise à jour contrôle l’espace libre du stockage du daemon Docker. Elle est reportée si l’espace manque ou ne peut être vérifié ; une mise à jour manuelle s’arrête avec une explication. Un updater disparu est détecté à toute étape ; un téléchargement encore actif après 20 minutes est signalé sans être déclaré arrêté. Après une mise à jour réussie, les anciennes images Enhanced inutilisées tirées par digest sont contrôlées chaque jour et peuvent être supprimées après 48 h. Les images actives, de rollback, de récupération ou explicitement exclues restent protégées ; cela n’active pas la purge générale des images.

**Coordination plus sûre entre ImageWatcher et Self-Update**

Les simples vérifications de registres et DNS ne retardent plus la mise à jour de Dockge-Enhanced. Les mises à jour d’images, rollbacks et nettoyages de tags de rollback qui modifient Docker partagent une réservation exclusive avec Self-Update : les opérations incompatibles sont reportées plutôt que lancées simultanément. L’état `scheduled` ne bloque pas inutilement ImageWatcher ; l’état persistant continue de protéger le sidecar après redémarrage. Le panneau Mises à jour donne la priorité à l’opération en cours plutôt qu’à une ancienne indication de disponibilité.

**Mises à jour groupées des images d’une stack**

La page d’une stack permet maintenant d’appliquer en une seule opération le mode **Désactivé**, **Immédiat** ou **Planifié** à ses images. Un aperçu liste les changements ; l’utilisateur choisit de **conserver les exceptions individuelles** (valeur par défaut) ou de les remplacer. Les services exclus par `dockge.imageupdates.check=false` restent protégés, les images partagées sont dédupliquées et les instances liées utilisent la même validation côté serveur. Les futures images ne sont pas automatiquement concernées.

**ImageWatcher : mises à jour immédiates plus rapides et plus fiables**

Pour les images configurées sur **Immédiat**, ImageWatcher effectue un contrôle ciblé dès l'activation, puis toutes les **5 minutes**, sans accélérer le scan global. Si plusieurs stacks partagent une même image `:latest`, Enhanced vérifie l'image **réellement exécutée par chaque conteneur**, et non seulement le tag local : un service resté sur une ancienne version n'est plus déclaré à jour à tort. Les requêtes identiques vers les registries sont mutualisées, les limitations de débit HTTP 429 entraînent une temporisation, et chaque contrôle ciblé produit un bilan dans les logs. Pauses, créneaux de maintenance et protections de rollback restent respectés.

**Exclusions du statut et des mises à jour par service**

L’éditeur Compose visuel peut ajouter `dockge.status.ignore: "true"` afin qu’un service optionnel ne dégrade plus le statut global de la stack après déploiement, tout en gardant son propre état visible. Il peut également ajouter `dockge.imageupdates.check: "false"` pour exclure un service des contrôles ImageWatcher et des mises à jour d’image automatiques ou groupées. La mise à jour explicite du service reste disponible. Les labels existants et leur syntaxe YAML sont préservés. Fonctionnalités inspirées de [hamphh/dockge](https://github.com/hamphh/dockge).

**Tout mettre à jour pour les images Docker**

La page Mises à jour peut traiter les images détectées une par une via le mécanisme Compose et de rollback existant. Elle affiche la progression, s'arrête au premier échec et garde l'auto-mise à jour d'Enhanced séparée.

**Diagnostics et métadonnées ImageWatcher (#493–#495)**

La page Images permet de trier les erreurs en premier. Les cibles temporairement inaccessibles sont conservées, les timeouts de manifestes bénéficient de reprises bornées, les erreurs de registre/authentification/digest sont plus explicites et la date d'une stack évolue uniquement après une mise à jour réellement confirmée.

**Commandes de mises à jour des stacks et images (#489–#490)**

La politique de mise à jour automatique d'une stack s'ouvre depuis sa barre d'actions dans une fenêtre dédiée, sans changer les réglages individuels des conteneurs. Les actions de mise à jour, ignorance, pause et rollback des images utilisent des boutons compacts avec libellés accessibles.

**DNS de secours pour les contrôles des registries**

Dans **Watcher > Images > DNS de secours**, il est possible d'activer le repli DNS (désactivé par défaut), d'ajouter, modifier ou supprimer des serveurs IPv4/IPv6 et de tester les requêtes A et AAAA avec délais et diagnostics. Le DNS système reste prioritaire ; le repli intervient uniquement en cas d'échec de résolution DNS lors des requêtes HTTP aux registries et aux services de jetons prises en charge par ImageWatcher. Quad9 (`9.9.9.9`, `2620:fe::fe`) et Cloudflare (`1.1.1.1`, `2606:4700:4700::1111`) servent d'exemples modifiables. Les paramètres déjà enregistrés sont conservés. Aucun DNS de l'hôte ou de Docker Engine n'est modifié ; les pulls et les auto-mises à jour pilotés par Docker Engine ne sont pas couverts.

**Auto-mise à jour via Docker Socket Proxy**

Le contrôle du self-update et le sidecar de mise à jour suivent le point d’accès Docker réellement utilisé par Enhanced : socket Unix (y compris `DOCKGE_DOCKER_SOCKET`) ou `DOCKER_HOST=tcp://…` derrière un Docker Socket Proxy de confiance. En TCP, aucun socket fictif n’est monté ; le sidecar est raccordé aux réseaux Docker de l’instance avant de consommer le plan signé. Les permissions requises côté proxy sont détaillées dans la section sur le déroulement d’une mise à jour automatique, plus bas.

#### Sauvegardes, nettoyage et fiabilité

**Purge des images Docker plus rapide et résistante aux courses**

Une purge en lot ne charge désormais l’inventaire Docker qu’une fois, puis revalide uniquement l’image ciblée juste avant chaque `docker rmi`. La page Ressources ne lance plus un énorme `docker image inspect` pour simplement afficher la liste, l’inspection est bornée par lots et tolère qu’une image disparaisse pendant un nettoyage concurrent, et l’expiration des rollbacks utilise le même verrou de nettoyage Docker. Les protections des conteneurs, rollback/récupération et délais de grâce restent appliquées.

**La purge utilise désormais les références Docker réelles**

La purge des images inutilisées ne suppose plus que le `Repository:Tag` affiché par `docker images` est une référence réellement attachée et supprimable. Elle utilise les `RepoTags` et `RepoDigests` inspectés, retire toutes les références nécessaires, puis applique si besoin un fallback sécurisé par Image ID et vérifie la disparition physique de l’image. Les protections liées aux conteneurs, exclusions, Enhanced active, récupération, rollback et délais de grâce restent appliquées.

**Les rapports de purge correspondent désormais à l’état Docker observé**

Lorsqu’une inspection par lot ne retourne pas une image, la purge vérifie maintenant directement son Image ID avant de la déclarer absente. Chaque suppression est contrôlée, puis un inventaire Docker final léger confirme le résultat rapporté. Ressources affiche séparément l’utilisation Docker et l’état de purge : une image `inutilisée` peut encore être Active Enhanced, protégée pour la récupération ou le rollback, trop récente ou exclue. Les images sans tag sont décrites de façon neutre comme **Image sans tag**, et non comme anciennes images. Le workflow reste borné à un inventaire initial, des contrôles ciblés et une vérification finale légère.

**Purge fiable des anciennes images Dockge-Enhanced `<none>`**

Les anciennes images `ghcr.io/aerya/dockge-enhanced:<none>` sont désormais sélectionnées depuis l’inventaire Docker au lieu de dépendre de métadonnées `RepoDigests` qui peuvent disparaître après un retag. Les images dépassant la garde de sécurité self-update de 48 h peuvent donc enfin être purgées de façon fiable, tandis que l’image active et les images protégées par la récupération restent intactes. Le résumé de purge ne compte plus non plus les images ordinaires réellement utilisées comme candidates protégées.

**Les images inutilisées `repository:<none>` sont désormais réellement purgées**

Docker peut conserver le nom du repository d’une image alors que son tag devient `<none>`. Ces images passaient jusque-là entre la purge des orphelines (`<none>:<none>`) et celle des images inutilisées taguées, si bien que les boutons et la purge planifiée pouvaient les laisser s’accumuler. Elles sont maintenant traitées comme des images inutilisées par Image ID, tout en respectant l’utilisation par des conteneurs, les exclusions, les protections rollback/récupération et les délais de grâce. Les anciennes images Dockge-Enhanced conservent en plus leur garde de sécurité de 48 h liée au self-update.

**Âge de purge par image pour les anciennes versions de Dockge-Enhanced**

Les anciennes images `ghcr.io/aerya/dockge-enhanced:<none>` tirées par digest vieillissent désormais indépendamment. Un nouveau self-update réussi ne remet plus à zéro le délai de 48 h de toutes les anciennes images Enhanced : chaque image obsolète est évaluée selon sa propre date de création, tandis que l’image active et les snapshots de récupération restent protégés. Si le nettoyage Docker unifié utilise un délai de grâce supérieur, ce délai plus long reste prioritaire.

**Nettoyage Docker unifié et rattrapage exact**

Ressources Docker partage un même inventaire par Image ID entre la page Images, l'aperçu Nettoyage et les purges. Le même délai de grâce s'applique désormais au nettoyage manuel et automatique, les différents tags d'une même image physique ne comptent qu'une fois et une image disparue pendant la purge est considérée comme déjà absente plutôt que comme une erreur. Les images de conteneurs arrêtés et les ressources de rollback/récupération restent protégées. Images, réseaux, volumes et cache de build se sélectionnent séparément, les résultats sont historisés par catégorie et les échéances sont contrôlées toutes les 15 minutes avec un seul rattrapage après une veille ou un redémarrage. Activer le nettoyage unifié suspend les anciens réglages d'auto-purge sans les effacer.

**Initialisation et ergonomie Restic (#491)**

Les actions d'enregistrement des paramètres, de sauvegarde immédiate et de maintenance sont séparées ; l'état des dépôts et les explications de rétention sont plus clairs et l'initialisation est mieux protégée.

**Messages backend en anglais (#477)**

Les erreurs de mot de passe Restic, bilans d'audit des purges et messages d'auto-mise à jour ne restent plus en français pour les installations anglophones.

**Healthcheck avec un proxy HTTP configuré**

Le healthcheck intégré du conteneur ignore les variables de proxy et interroge directement `127.0.0.1` : un proxy configuré ou injoignable ne rend plus Enhanced « unhealthy ». Les autres accès réseau continuent d’utiliser le proxy configuré.

#### Supervision et intégrations

**Monitoring électrique facultatif avec PowerWatch**

[PowerWatch](https://github.com/Aerya/PowerWatch) peut désormais être connecté en mode **Externe**, qui lit uniquement un conteneur local ou une URL HTTP(S) existante sans jamais le piloter, ou déployé en mode **Géré** sous forme de vraie stack Compose. L’installation gérée détecte les capacités RAPL, MSR et NVIDIA de l’hôte, n’active que les accès nécessaires, n’utilise jamais `privileged: true` et conserve l’historique et les paramètres dans un volume persistant après arrêt ou désactivation.

La puissance instantanée globale, sa fiabilité et un accès direct à la WebUI apparaissent dans Monitoring, la barre système et le résumé compact des instances liées via la fédération existante. La barre système et les cartes d’instances affichent uniquement les watts près du pictogramme électrique ; l’infobulle identifie PowerWatch et son niveau Measured ou Estimated. PowerWatch mesure ou estime la consommation selon les capteurs disponibles.

Un **PowerWatch Hub** facultatif peut être installé et géré directement par Enhanced ou relié à un Hub existant avec sa seule URL WebUI. Il reste un service distinct : il agrège les API HTTP privées de PowerWatch existants dans son propre tableau de bord et ne nécessite aucun privilège matériel hôte. Dockge-Enhanced ouvre seulement ce lien Hub global ; il ne le répète pas pour chaque instance liée. PowerWatch propose désormais une authentification native facultative, **désactivée par défaut**, avec jetons API Bearer en lecture seule. **Enhanced prend désormais en charge ces jetons Bearer en lecture seule** pour interroger une instance PowerWatch protégée. Renseignez le jeton dans **Monitoring → PowerWatch → Jeton API en lecture seule**. Le jeton enregistré reste masqué et n’est jamais envoyé au Hub. Le Hub propose séparément un jeton facultatif pour protéger ses opérations d’administration. Ne publiez aucune interface non protégée sur Internet.

**Services de supervision facultatifs : Kula, Dozzle, PowerWatch et Hub**

Dans **Monitoring** (`/watcher/monitoring`), les quatre services tiers facultatifs disposent d'encarts homogènes et indépendants, avec description et lien GitHub. PowerWatch et son Hub disposent chacun d'un mode externe ou géré, des actions installer/démarrer/redémarrer/arrêter et d'un test de connexion. Le Hub géré utilise l'exécutable `powerwatch-hub` de l'image PowerWatch, écoute par défaut sur `127.0.0.1:3065` et conserve ses données dans un volume Docker distinct.

Pour relier un **PowerWatch existant**, saisissez simplement l’adresse habituelle de sa **WebUI** (par exemple `http://192.168.0.64:3064`) dans « URL de PowerWatch » : Enhanced appelle automatiquement `/api/snapshot` à la même adresse. Une seconde URL WebUI n’est utile qu’avec une configuration réseau particulière et reste dans les options avancées. Pour un **Hub existant**, saisissez de même son URL WebUI : `/api/hub/snapshot` est utilisé automatiquement.

**Historique CPU/RAM hôte facultatif**

Monitoring peut enregistrer un échantillon léger du CPU et de la RAM hôte toutes les 5 minutes, sans navigateur ouvert. Le graphique SVG responsive propose 24 h, 7 jours, 1 mois ou une plage personnalisée ; la période d'affichage choisie peut être enregistrée et retrouvée à la prochaine ouverture. Les longues périodes sont agrégées côté serveur et les arrêts restent visibles sous forme de trous. L'enregistrement est désactivé par défaut et continue en mode faible consommation s'il est explicitement activé.

L’historique CPU/RAM conserve les vrais trous de collecte, mais adopte un graphique plus compact inspiré de PowerWatch, avec grille allégée et remplissage discret.

#### Stacks, interface et ergonomie

**Actions de stack directement accessibles**

Toutes les actions de stack sont accessibles directement dans la barre d’actions, sans sous-menu, en groupes visuellement séparés qui passent à la ligne selon la largeur disponible. Les modes icônes seules et icônes avec texte conservent leurs infobulles ; les commandes, conditions de disponibilité et confirmations sont inchangées.

**Interface en allemand**

L’interface et les nouveautés sont disponibles en allemand, avec un README et un changelog allemands. Les notifications Discord et Apprise restent en anglais lorsque l’allemand est sélectionné.

**Compteurs de conteneurs sur l’accueil**

L’accueil affiche les conteneurs en cours d’exécution, arrêtés et en pause, y compris ceux des instances liées joignables. Les compteurs de stacks et de conteneurs suivent le filtre d’instance de la liste des stacks.

**Démarrages de stacks plus sûrs et contrôles d’images immédiats**

Enhanced prépare désormais les répertoires hôte manquants des bind mounts absolus avant un démarrage, déploiement ou une recréation lorsque le montage est clairement de type dossier. C’est particulièrement utile sur les NAS Synology où Docker refuse une source de bind inexistante. Les sources ressemblant à des fichiers ne sont jamais créées automatiquement comme dossiers. Le mode **Immédiat** d’une image lance maintenant son contrôle ciblé dès l’enregistrement. Après un redémarrage réussi, Enhanced recharge aussi l’état réel de la stack et masque l’ancienne sortie de progression Compose.

**Volumes et logs plus lisibles dans les stacks**

Les volumes montés et les conteneurs réels utilisent des lignes compactes au lieu de boutons sur toute la largeur. Dans les logs, les trois filtres sont empilés, les actions regroupées et la recherche placée à la fin ; les noms des filtres restent accessibles aux technologies d’assistance. Les paramètres d’apparence peuvent activer l’horodatage des logs par défaut pour ce navigateur.

**Palettes de couleurs jour et nuit**

Les paramètres d’apparence proposent désormais des palettes distinctes pour les modes clair et sombre : quatre choix de jour et huit de nuit, thèmes d’origine compris. Catppuccin, Nord, Solarized, Dracula, Gruvbox, Tokyo Night et Rosé Pine recolorent la page, l’en-tête, les panneaux et les contrôles. Les choix sont conservés dans le navigateur ; le mode Auto suit toujours le thème du système.

**Connexions fiables entre instances liées**

L’ajout ou la modification d’une instance liée rafraîchit désormais les navigateurs sans déconnecter les sockets de fédération. Les deux instances restent connectées après la synchronisation du maillage et après un redémarrage.

**Gestionnaires de mots de passe**

La création du compte identifie désormais les champs nom d’utilisateur et nouveau mot de passe pour les gestionnaires de mots de passe du navigateur.

**Contrôles des stacks et création Compose**

La pause/reprise fige les conteneurs sans supprimer les volumes. Les mises à jour automatiques d’images attendent la reprise ; l’action est bloquée pendant un backup ou une restauration Restic, et la pause est indisponible pour la stack d’Enhanced lui-même ou celles dont la politique de sauvegarde arrête les services ou utilise des hooks. Les paramètres généraux proposent un modèle Compose par défaut validé, réservé aux nouvelles stacks. Le README.md d’une stack s’ouvre désormais par un bouton d’action au lieu d’une barre pleine largeur ; les icônes des actions conteneur disposent d’infobulles explicatives. La protection des modes octaux `tmpfs` et le surlignage des variables Compose déjà présents restent inchangés.

**Actions de stack plus claires**

Les boutons expliquent désormais ce qu’ils exécutent. Une aide affiche les commandes Docker Compose réelles de la stack sélectionnée, avec ses options de projet et ses fichiers Compose, ainsi que des liens vers la documentation Docker. L’ancien bouton « Arrêter et désactiver » devient « Démonter la stack » : il lance `docker compose down` après confirmation, supprime les conteneurs et réseaux Compose, mais pas les volumes nommés, les données bind, les fichiers Compose ni les images. Les volumes anonymes risquent de ne pas être remontés au prochain `up`.

**Nom d’affichage des stacks**

Vous pouvez définir un nom d’affichage depuis la page d’une stack. Son nom technique, son projet Compose, sa sélection de sauvegarde et son chemin de restauration ne changent pas ; le nom technique reste visible à côté de l’alias.

**Vue par conteneur réel**

Chaque service Compose liste désormais ses conteneurs séparément, y compris ses réplicas. Vous pouvez ouvrir un conteneur pour voir son état, sa santé, son image, ses ports, ses ressources et ses derniers logs, ou démarrer, arrêter et redémarrer précisément ce conteneur. Les actions sur le service entier ne changent pas. Fonction inspirée de [Lorwell/dockge](https://github.com/Lorwell/dockge).

**Gestionnaire de fichiers hôte facultatif**

La page Fichiers, activée sur demande, permet de parcourir un dossier hôte dédié, de modifier de petits fichiers UTF-8, de transférer des fichiers et de suivre des journaux écrits dans des fichiers, localement ou sur une instance Enhanced liée. Elle est distincte du navigateur de volumes par stack et ne donne pas accès aux chemins hors de sa racine autorisée.

Montez uniquement le dossier à exposer dans Enhanced et définissez `DOCKGE_FILE_MANAGER_ROOT` avec son chemin **dans le conteneur**. Par exemple, ajoutez `- /srv/partage:/managed-files` aux `volumes:` et `DOCKGE_FILE_MANAGER_ROOT: /managed-files` à `environment:`. Sans ce réglage, le gestionnaire reste désactivé ; **ne montez pas `/` ni un vaste dossier hôte**. Il refuse également les opérations si l’authentification est désactivée. `DOCKGE_FILE_MANAGER_MAX_FILE_SIZE` limite facultativement les transferts (100 Mio par défaut) ; l’édition de texte en ligne est limitée à 1 Mio. Chaque instance liée exige son propre montage et son propre réglage.

**Copier-coller dans les terminaux des conteneurs**

Le clic droit ouvre désormais le menu natif Copier/Coller du terminal. Le collage au clavier fonctionne aussi sur les adresses HTTP locales, sans dépendre de l’API presse-papiers du navigateur.

**README.md pour les stacks gérées**

La page d’une stack permet d’afficher et de modifier un `README.md` en Markdown, enregistré à côté du fichier Compose. Ce fichier est distinct de la note courte et suit la stack lors d’une copie ou d’un déplacement vers une autre instance Dockge-Enhanced. Cette fonction ne modifie pas les stacks externes.

### 🆕 Septembre 2026

**Purge automatique des images fiabilisée**

La purge ne saute plus le créneau suivant lorsque la précédente exécution s'est terminée quelques secondes après l'heure prévue. Les images utilisées par un conteneur, même arrêté, ainsi que les images de rollback sont conservées. Les anciennes images de Dockge-Enhanced tirées par digest deviennent éligibles au prochain nettoyage au moins 48 h après un self-update réussi ; l'image active et celles de récupération restent disponibles. Les erreurs Docker de la dernière purge sont visibles dans Ressources Docker.

**Alertes de disponibilité de fédération sans spam nocturne**

Les notifications du coupe-circuit sont désormais liées à un épisode continu d’indisponibilité : chaque instance liée envoie au maximum une alerte tant que le pair reste hors ligne, et l’alerte n’est réarmée qu’après une authentification réellement réussie du pair. Chaque instance distante peut aussi être marquée localement **Machine intermittente — ne pas alerter si indisponible**. Ce mode est prévu pour les PC, portables et autres pairs régulièrement éteints ou en veille ; les reconnexions automatiques, le backoff et le coupe-circuit restent actifs. La préférence étant locale, il faut marquer le pair intermittent sur chaque instance Dockge toujours allumée depuis laquelle on ne souhaite pas recevoir ces alertes.

**Transport de fédération partagé au niveau du processus**

La fédération utilise désormais un seul transport sortant partagé par processus Dockge-Enhanced, au lieu d’un jeu de connexions par socket WebUI. Les instances liées sont chargées depuis SQLite et connectées automatiquement dès que le serveur écoute. Ouvrir plusieurs WebUI ne multiplie plus les sockets distantes, fermer le dernier navigateur ne déconnecte plus les instances liées et la reprise du coupe-circuit continue après environ 5 minutes même sans WebUI ouverte. Un changement d’identifiants, une réparation du mesh ou la suppression d’un pair resynchronise immédiatement le transport partagé.

**Protection contre les tempêtes de reconnexion de fédération**

Les sockets fédérées suivent désormais un chemin d’authentification léger et ne déclenchent plus l’initialisation WebUI des stacks/agents. Les reconnexions Socket.IO sont explicitement bornées avec backoff exponentiel, jitter et coupe-circuit de 5 minutes. Les handshakes de fédération entrants excessifs sont rejetés avant authentification et le nombre de sockets fédérées entrantes simultanées est plafonné. Si un garde-fou de reconnexion se déclenche ou qu’une contention SQLite/Knex est détectée, la configuration Discord/Apprise existante envoie une alerte limitée en fréquence sans interroger SQLite.

**Mises à jour ciblées respectant les namespaces réseau**

Les mises à jour d’images ciblées, les recréations de services et les rollbacks d’images résolvent désormais le modèle Compose complet avant de remplacer un conteneur. Lorsque d’autres services partagent son namespace réseau via `network_mode: service:<service>` ou `network_mode: container:<container_name>`, tous les consommateurs directs et transitifs sont recréés de force avec le fournisseur dans une même opération Compose ciblée. Les services sans rapport restent intacts, tandis que les stacks VPN, Gluetun et sidecars ne conservent plus le namespace réseau obsolète d’un conteneur supprimé.

**Stacks externes (Beta)**

Enhanced peut détecter des projets Docker Compose existants, les adopter **sans déplacer leur Compose/.env ni leurs données**, puis les gérer depuis l’interface normale des stacks. Si un chemin source n’est pas encore accessible dans Enhanced, une autorisation protégée en un clic adapte automatiquement le Compose d’Enhanced. Les stacks adoptées conservent le nom de leur projet sans préfixe `external-` redondant et portent le badge **Externe** ; la suppression des fichiers source demande une confirmation supplémentaire explicite. Le scanner fait également correspondre le répertoire de stacks d’Enhanced avec son bind côté hôte : les stacks déjà gérées par l’instance sont donc exclues même lorsque les labels Docker Compose contiennent leurs chemins hôte.

Lorsque la suppression permanente des sources est choisie, Enhanced retire désormais le bind source et son entrée d’autorisation de son propre Compose via le helper protégé, recrée uniquement son conteneur, puis supprime le dossier hôte. Cela évite les erreurs `EBUSY` provoquées par la suppression d’un dossier encore utilisé comme point de montage d’Enhanced.

Un cas explicitement pris en charge est [Gluetun-Companion](https://github.com/Aerya/Gluetun-Companion) : il peut recréer une stack Gluetun déjà gérée par Enhanced depuis un chemin `/compose` monté par bind. Enhanced rapproche désormais ce type d’alias Compose de la stack native et ne la propose plus à tort comme externe.

**Comptage anonyme des installations**

Afin de connaître approximativement le nombre d’installations de Dockge-Enhanced réellement actives sans exploiter de service d’analytics séparé, Enhanced télécharge au maximum une fois par mois un minuscule fichier technique placé dans une release GitHub dédiée. Le `download_count` public de GitHub pour cet asset mensuel est le seul agrégat utilisé pour le comptage.

Aucun identifiant d’installation n’est généré ni transmis pour ce comptage. La requête ne contient aucun hostname, nom d’instance, stack, conteneur, image Docker, configuration, chemin, compte GitHub, e-mail, architecture ou identifiant de build. Comme pour tout téléchargement d’asset GitHub, la connexion elle-même est traitée par GitHub ; Dockge-Enhanced ne reçoit ni ne stocke l’adresse IP des installations.

Le mois déjà compté est mémorisé uniquement dans le répertoire de données local afin qu’une même installation ne télécharge l’asset qu’une fois par mois. Le comptage est activé par défaut et peut être désactivé avec `DOCKGE_USAGE_COUNT=false`. Une recréation ou suppression du répertoire de données peut faire recompter la même installation pendant le mois en cours : le chiffre reste donc volontairement approximatif.

Le mécanisme est entièrement public : [code côté Enhanced](./backend/anonymous-install-count.ts), [workflow GitHub qui crée les assets mensuels](./.github/workflows/usage-count-asset.yml) et [compteurs mensuels agrégés](https://github.com/Aerya/Dockge-Enhanced/releases/tag/usage-count).

Les propriétaires du dépôt peuvent ajouter un secret Actions nommé `USAGE_COUNT_DISCORD_WEBHOOK` pour recevoir un compteur provisoire chaque lundi et le total définitif du mois précédent le premier jour de chaque mois. Le workflow peut également être lancé manuellement afin d’envoyer immédiatement le compteur actuel. La valeur du webhook reste chiffrée par GitHub et n’est jamais enregistrée dans le dépôt.

**Recherche globale multi-instance V2 (`Ctrl+K`)**

La palette globale accepte désormais les **correspondances floues** pour tolérer de petites fautes de frappe et des opérateurs assistés comme `type:`, `stack:`, `image:`, `port:`, `instance:` ainsi que des filtres opérationnels `is:update`, `is:stopped`, `is:vulnerable`, `is:critical` et `is:backup-failed`. Des boutons d’aide sont affichés directement dans la palette : il n’est pas nécessaire de mémoriser cette syntaxe. Un résultat Compose ou `.env` ouvre la bonne stack et positionne directement CodeMirror sur la ligne trouvée. Les recherches récentes et les recherches épinglées sont conservées localement dans le navigateur.

La recherche dans la configuration des **snapshots Restic récents** s’active explicitement depuis la palette ; elle est volontairement bornée à 5 snapshots récents et 80 fichiers Compose/.env par instance afin de protéger les dépôts distants. La recherche dans les **valeurs `.env`** est elle aussi optionnelle : la valeur sert uniquement à détecter une correspondance, n’est jamais renvoyée ni affichée et, lorsque ce mode sensible est actif, la requête n’est enregistrée ni dans l’historique ni dans les favoris. Les instances liées utilisent le protocole V2 lorsqu’il est disponible, avec repli sur la V1 pour les recherches simples vers une instance encore ancienne.

**Protection de l’auto-mise à jour pendant l’édition d’un Compose/.env**

Lorsqu’un compose, son override ou son `.env` contient des modifications non enregistrées dans la WebUI, l’instance Dockge-Enhanced propriétaire bloque temporairement son auto-mise à jour — y compris si l’édition a été ouverte depuis une autre WebUI liée. L’éditeur maintient un lease court par heartbeat afin qu’une session navigateur abandonnée expire automatiquement. Si une mise à jour devient prête pendant l’édition, un popup permet **d’enregistrer puis mettre à jour**, de **reporter de 30 minutes**, de **reporter d’1 heure** ou de **continuer à travailler**. Le backend revérifie aussi les bloqueurs juste avant la préparation puis le lancement du sidecar afin qu’une édition commencée pendant le backup/la vérification ne puisse pas être interrompue par le redémarrage.

**Vue synthétique des instances liées sur l’accueil**

Le panneau des agents déjà présent sur l’accueil devient également une vue compacte de l’infrastructure. Chaque instance Dockge-Enhanced liée affiche le nombre et l’état de ses stacks, l’utilisation CPU/RAM de l’hôte, son uptime et le nombre de stacks épinglées, tout en conservant les actions existantes de renommage, réauthentification, suppression et ajout d’agent. Un clic sur le résumé d’une instance filtre la liste des stacks à gauche sur ce serveur ; un second clic rétablit la vue de tous les serveurs.

**Stats CPU/RAM par stack entre instances liées**

L’option **Afficher les stats CPU / RAM par stack** appartient désormais à chaque instance Dockge-Enhanced. Lorsqu’elle est activée sur un serveur, celui-ci collecte ses propres statistiques Docker et les expose via le canal existant des instances liées. Toute WebUI liée qui affiche ce serveur montre les mêmes badges CPU/RAM pour ses stacks et leurs conteneurs. Masquer le serveur masque ses statistiques ; désactiver l’option sur l’instance propriétaire arrête leur collecte et leur exposition pour cette instance.

**Stacks épinglées persistantes entre instances liées**

Les stacks épinglées appartiennent désormais à l’instance Dockge-Enhanced qui les héberge, et non plus au `localStorage` d’un navigateur. Épingler une stack de Garuda, DockerLab ou LincStation enregistre la préférence sur le serveur correspondant. Toute WebUI liée qui affiche ce serveur retrouve la même stack épinglée ; masquer ce serveur masque ses épingles sans les supprimer. Les épingles survivent ainsi aux déconnexions/reconnexions, aux changements de navigateur et aux mises à jour de Dockge-Enhanced. Les anciennes épingles locales sont migrées automatiquement lorsque leurs instances propriétaires sont joignables.

**Rétention dédiée des backups de self-update**

Les snapshots Restic obligatoires créés avant une auto-mise à jour protégée de Dockge-Enhanced utilisent désormais une politique de rétention dédiée. Une fois le nouveau snapshot **créé et vérifié**, Dockge-Enhanced conserve les **2 derniers snapshots self-update de cette installation** et supprime les générations plus anciennes avant de lancer le sidecar. Un tag stable propre à l’installation évite de nettoyer les snapshots d’une autre instance Dockge-Enhanced partageant le même dépôt Restic. La rétention normale (`keepLast`, quotidienne, hebdomadaire, mensuelle) reste inchangée. Si ce nettoyage dédié échoue, le backup vérifié est conservé et la mise à jour peut continuer ; l’erreur est journalisée et une auto-mise à jour ultérieure retentera le nettoyage.

**Rapprochement des noms de projets Docker Compose**

Les stacks gérées dont le dossier contient des points ou des majuscules sont désormais rapprochées de Docker Compose à partir du chemin réel `ConfigFiles`, au lieu de dépendre uniquement du nom de projet normalisé par Docker. Cela évite les doublons « gérée/arrêtée » et « externe/en cours » pour une même stack.

**Prise en charge de la syntaxe longue des ports Compose**

Les cartes des conteneurs prennent désormais en charge les syntaxes courte et longue des ports Compose. Les définitions utilisant `published`, `target`, `protocol`, `mode` ou `host_ip` ne provoquent plus l'erreur `split is not a function` et ne font plus disparaître la carte du conteneur. Les valeurs IPv6 de `host_ip` sont également correctement formatées dans les liens générés.

**Correction et formatage YAML Compose**

L’éditeur de stack propose une action **Corriger / formater YAML** pour `compose.yaml`. Si le document est déjà valide, son indentation est simplement normalisée à **2 espaces**. S’il est invalide à cause d’erreurs d’indentation Compose courantes, Dockge-Enhanced tente de réaligner les clés et listes (`services`, options de service, `environment`, `ports`, `volumes`, `healthcheck.test`, etc.), valide le résultat, puis le formate. Les commentaires et permissions `tmpfs.mode` avec zéro initial sont conservés. Si une correction sûre ne peut pas être produite, le contenu original reste intact et l’erreur est affichée.

**Préservation des permissions tmpfs dans l'éditeur Compose**

L'éditeur visuel Compose conserve désormais les valeurs octales avec zéro initial telles que `tmpfs.mode: 01777` lorsqu'il régénère le YAML. Modifier un autre champ ne réécrit donc plus silencieusement cette permission en `1777`.

**Protection renforcée contre le path traversal des stacks**

Les noms de stacks fournis aux opérations backend sont désormais validés avant toute résolution de chemin, y compris dans les chemins de code qui ignorent volontairement la découverte filesystem. Un nom forgé tel que `../outside` ne peut plus sortir du répertoire des stacks gérées pour accéder aux fichiers Compose ou `.env` d'une autre application.

**Auto-mise à jour protégée de Dockge-Enhanced**

Dockge-Enhanced peut désormais se mettre à jour via un sidecar volontairement restreint. Chaque mise à jour exige un backup Restic et une vérification d'intégrité du dépôt avant remplacement du conteneur. La nouvelle version doit ensuite passer les contrôles de disponibilité ; sinon l'image précédente immuable est restaurée automatiquement.

**État des mises à jour sur les serveurs distants**

Les informations de mise à jour des images sont récupérées séparément depuis chaque instance Dockge-Enhanced connectée. Les stacks distantes affichent donc leurs propres badges de mise à jour sans mélanger les serveurs ou les stacks portant le même nom.

**Identification claire des builds et progression des mises à jour**

L'onglet Mises à jour identifie désormais les builds installés et disponibles grâce aux métadonnées OCI : date de build, commit Git et digest immuable. Les différentes étapes, la progression Restic, le temps écoulé et l'estimation restante sont affichés de manière cohérente.

**Annonces distantes**

Dockge-Enhanced peut afficher une **annonce opérationnelle en texte uniquement publiée depuis ce dépôt GitHub**, indépendamment du mécanisme de mise à jour de l'image Docker. Ce canal de secours a été ajouté à la suite de l'incident d'auto-mise à jour de fin août / début septembre 2026 : si un futur build présente un problème important, une version installée concernée pourra recevoir un avertissement sans devoir attendre que ce même mécanisme de mise à jour fonctionne.

Les annonces proviennent de [`remote-announcements.json`](remote-announcements.json). Elles sont facultatives, récupérées uniquement en HTTPS, validées par un schéma strict, limitées en taille et en nombre, et peuvent être ciblées par version de l'application, révision Git ou date de build OCI. Elles **ne peuvent exécuter aucune commande, injecter du HTML ni déclencher une mise à jour**. Les liens sont limités au dépôt GitHub de Dockge-Enhanced. Si GitHub est indisponible ou si le document est invalide, aucune annonce n'est affichée.

Fermer une annonce ne la masque que pour la session du navigateur. **Ne plus afficher** mémorise son identifiant dans les données persistantes de Dockge-Enhanced ; une nouvelle annonce utilise un nouvel identifiant.

**Compatibilité entre instances liées**

Les opérations **Copier**, **Déplacer** et **Répliquer** négocient un **protocole de transfert** indépendant du SHA du build. Des builds différents restent autorisés lorsque leur protocole est compatible. En cas d’incompatibilité, aucun transfert ne démarre. Une instance distante assez récente pour connaître ce mécanisme peut être mise à jour depuis la WebUI via le self-update normal (backup Restic, sidecar, healthcheck et rollback), puis Dockge-Enhanced attend jusqu’à **2 heures** sa reconnexion avant de reprendre. Une version trop ancienne pour répondre au handshake exige une mise à jour manuelle. La réplication permanente passe en **En attente de compatibilité** et retente environ toutes les 10 minutes sans modifier les données.

**Identification permanente de l’instance locale**

Le **nom de l’instance locale** défini dans Dockge Agents est affiché en permanence dans le header desktop/mobile et dans le titre de l’onglet (`NomInstance · Dockge-Enhanced`). Si aucun nom n’est défini, l’hôte (`IP:port` ou domaine) est utilisé comme repère. Aucun réglage supplémentaire n’est nécessaire.

**Journal de nouveautés non lues**

La popup de nouveautés conserve désormais chaque entrée de release individuellement. Si plusieurs mises à jour automatiques sont installées sans que la WebUI soit ouverte, **toutes les nouveautés accumulées** sont présentées à la prochaine ouverture. Ouvrir ou recharger la page ne marque rien comme lu : les entrées affichées ne sont acquittées que lorsque l’utilisateur ferme explicitement la popup. Le stockage repose sur les IDs des releases et ne dépend plus de leur position dans la liste. L’ancien marqueur `releaseNewsSeen` est migré automatiquement sans réafficher tout l’historique aux utilisateurs existants.

### Août 2026

**Migration transactionnelle et réplication des stacks**

Créez les nouvelles politiques de réplication **directement sur l’instance source**. Une politique est stockée sur l’instance où elle a été créée, et non automatiquement partagée entre les instances liées. Les anciennes politiques créées depuis une autre instance y restent gérables ; vérifiez et retirez manuellement toute ancienne politique en double avant d’en créer une nouvelle. Ce changement ne supprime ni politique ni donnée de réplique.

Depuis une vue liée de la stack source, Enhanced affiche l’état de réplication de l’instance source en lecture seule, séparément d’une éventuelle ancienne politique gérée par l’instance courante. La configuration de la politique n’est pas transmise à la vue liée.

Les stacks peuvent être copiées ou déplacées entre instances Dockge-Enhanced avec leur configuration Compose et leurs données persistantes. Les transferts sont reprenables, validés côté cible et protégés par des mécanismes de rollback.

**Prérequis hôte et récupération automatique**

Une stack peut exiger qu'un montage hôte ou un service `systemd` soit disponible avant son démarrage. Dockge-Enhanced peut également surveiller ces dépendances et gérer proprement leur disparition puis leur retour.

**Interface responsive et supervision enrichie**

La navigation des stacks, l'espace Logs/Compose, les indicateurs de ressources, les cartes de santé, les thèmes et l'affichage mobile ont été largement remaniés.

➡️ **[Consulter le changelog complet](CHANGELOG.fr.md)**

</details>

---

## Catalogue des fonctionnalités

<details>
<summary>Afficher toutes les fonctionnalités</summary>

### Multi-serveurs & fédération
- Fédération en maillage complet entre instances Dockge-Enhanced, administrables depuis n’importe quelle WebUI liée
- Connexions inversées facultatives pour les hôtes derrière NAT/CGNAT, avec un jeton par nœud, rattachement automatique et révocation ; les agents inversés appartiennent à leur serveur central ([guide](docs/compose-and-reverse-agents.fr.md))
- Tags d’agents persistants et filtrage par tag, combinés au filtre par instance
- Sélection, regroupement et couleurs stables des serveurs dans la liste des stacks
- Vue des instances liées sur l’accueil, avec statistiques Instance / Global, joignabilité et liens directs vers chaque WebUI
- État des stacks, badges de mise à jour d’images et statistiques CPU/RAM par stack fournis par chaque instance
- Jetons de fédération dédiés, réparation des liens rompus et connexions préservées lors des rafraîchissements du navigateur
- Transport de fédération partagé par le processus, reconnexions bornées, circuit breaker et une seule alerte de disponibilité par panne
- Machines intermittentes pouvant être exclues des alertes de disponibilité
- Négociation du protocole de transfert entre versions différentes de Dockge-Enhanced
- Choix par instance du nom d’hôte ou de l’adresse IP pour les liens de ports des conteneurs

### Gestion des stacks
- Création, édition, démarrage, arrêt, redémarrage, mise à jour, recréation, pause/reprise et démontage des stacks Compose
- Barre d’actions de stack directement accessible, en mode icônes seules ou icônes avec texte, avec les commandes Compose expliquées
- Actions par service et par conteneur, y compris sur les conteneurs réels et les réplicas Compose
- Recréation automatique des services directs et transitifs partageant un namespace réseau VPN via `service:` ou `container:`
- Build + Recreate pour les images construites localement
- Démarrage/arrêt planifié des stacks et des conteneurs
- Prérequis de démarrage hôte (montages et services `systemd`), avec surveillance et reprise facultatives
- Stacks épinglées persistées sur le serveur et partagées entre WebUI liées
- Nom d’affichage facultatif dans la WebUI, sans modifier le projet Compose ni l’identité Restic
- Notes par stack, `README.md` Markdown et outils Git
- Tri par nom, état, instance, date de création, dernière mise à jour, CPU ou RAM
- Barre latérale repliable et redimensionnable avec indicateurs compacts d’état, CPU et RAM, et espace Logs/Compose flexible
- Rapprochement des noms de projets Compose : les dossiers contenant des points ou des majuscules ne créent pas de stacks en double
- Détection et adoption des stacks Compose externes sans déplacer fichiers ni données, avec autorisation protégée des chemins
- Suppression complète facultative des stacks externes adoptées et nettoyage par labels des stacks externes cassées, avec confirmations renforcées
- Option par service pour ignorer un service facultatif dans l’état global de la stack

### Édition Compose

- **Nom du fichier Compose par défaut** — COMPOSE_FILENAME choisit compose.yaml (par défaut), compose.yml, docker-compose.yaml ou docker-compose.yml uniquement pour les nouvelles stacks. Les stacks existantes et adoptées conservent leurs fichiers. Les autres noms et chemins sont refusés.
- limites CPU/RAM facultatives par service — Préparé dans cette PR ; pas encore publié. Modifie uniquement le brouillon. Enregistrez, puis déployez/recréez explicitement pour appliquer aux conteneurs ; les conteneurs actifs ne sont pas modifiés ici.
- Éditeurs Compose, `compose.override.yaml` et `.env` avec surlignage des variables, repli, recherche et plein écran
- Modèles Compose et `.env` par défaut validés, appliqués aux nouvelles stacks uniquement
- Liens HTTP/HTTPS nommés pour les stacks
- Action Corriger / formater le YAML, conservation des valeurs entre guillemets et des modes octaux `tmpfs`
- Prise en charge de la syntaxe longue des ports
- Assistant de healthcheck facultatif par service, avec proposition HTTP/TCP modifiable et aperçu de la commande
- Contrôles indicatifs des conflits de ports et des écarts avec l’image en cours d’exécution avant enregistrement ou déploiement
- `TZ` facultatif par stack, appliqué uniquement après relecture et confirmation
- Assistant de labels PlugNPiN pour Nginx Proxy Manager, Pi-hole et AdGuard Home

### Migration & réplication
- Copie ou déplacement des stacks entre instances avec leur configuration Compose
- Transfert des bind mounts et volumes nommés, avec correspondances source → cible modifiables
- Transferts HTTP directs reprenables, dépôts Restic partagés ou profils SSH/rsync explicites
- Vérification SHA-256, déploiement transactionnel et rollback
- Transfert facultatif des images Docker locales et des identifiants de registres privés chiffrés
- Détection des conflits `container_name` et affichage des vraies erreurs de déploiement
- Finalisation explicite d’un déplacement ou retour vers la source
- Répliques froides planifiées configurées sur l’instance source, avec snapshots conservés et bascule manuelle
- Tests de reprise isolés et profils applicatifs PostgreSQL, MariaDB/MySQL, Redis et SQLite

### Sauvegarde & restauration
- Sauvegardes Restic natives des fichiers Compose, `.env`, bind mounts, volumes nommés et de `/app/data`
- Destinations multiples : locale, SFTP/NAS, S3/Backblaze B2 et REST Server
- Sauvegardes planifiées, **Sauvegarder maintenant** et sauvegardes à l’enregistrement du Compose, avec protection contre les exécutions simultanées
- Cohérence par stack : à chaud, arrêt puis redémarrage, ou hooks applicatifs
- Exclusion de stacks, patterns d’exclusion intégrés et personnalisés, exclusion automatique des dépôts locaux imbriqués
- Initialisation des seuls dépôts manquants, avec blocage en cas d’erreur d’accès, de réseau ou de mot de passe
- Rétention ordinaire et rétention dédiée aux sauvegardes de self-update
- Réinitialisation sécurisée des dépôts Local, SFTP, S3 et REST, en conservant l’ancien dépôt pour la récupération
- Navigateur de snapshots avec aperçus et diffs, restauration sélective et restauration par stack
- Tests de restauration après les sauvegardes planifiées, `restic check`, historique et alertes de sauvegarde en retard
- Zerobyte facultatif : connexion à une instance existante ou installation Compose gérée dédiée, en complément de Restic ou pour les sauvegardes planifiées, avec des dépôts séparés
- Création guidée des sources, dépôts et jobs Zerobyte ; les nouveaux jobs restent désactivés jusqu’à vérification, et les jobs existants peuvent être migrés après confirmation
- Workflows Zerobyte protégés d’arrêt/redémarrage, contrôles d’intégrité, journal de reprise persistant et reprise manuelle ciblée
- Contrôles du stockage réseau Zerobyte sans repli local, restaurations de test dédiées et état fédéré en lecture seule
- Guides : [Sauvegardes et restauration Restic](docs/restic.fr.md) · [Installation et reprise Zerobyte](docs/zerobyte.fr.md)

### Mises à jour & ImageWatcher
- Détection des mises à jour d’images par digest, sans pull, y compris sur les instances distantes
- Politiques Désactivé, Immédiat et Planifié par image, et réglages groupés par stack qui conservent par défaut les exceptions individuelles
- Analyse complète toutes les 6 heures par défaut et contrôles ciblés en mode Immédiat toutes les 5 minutes par défaut, configurables ou désactivables séparément
- Contrôle des images réellement utilisées par chaque conteneur, requêtes de registre partagées et nouvelles tentatives sur HTTP 429/503
- DNS de secours facultatif pour les contrôles de registres, sans modifier le DNS de l’hôte ni de Docker Engine
- Respect de **Ignorer** et de `dockge.imageupdates.check: "false"` avant tout pull ou recréation, y compris pour le Dozzle géré
- Mises à jour d’images manuelles, automatiques et « tout mettre à jour » séquentielles, avec rollback vers l’image précédente
- Les stacks arrêtées ou en pause ne sont pas réveillées par les mises à jour automatiques
- Pause globale et par image, versions ignorées et historique des mises à jour automatiques
- Une seule notification de mise à jour en attente par stack, image, digest et destination
- Créneau de maintenance global : lorsqu’il est configuré pour les mises à jour automatiques de Dockge-Enhanced, il s’applique aussi aux mises à jour automatiques d’images, sinon les horaires par image s’appliquent ; **Mettre à jour** reste immédiat
- Auto-mise à jour protégée de Dockge-Enhanced avec sauvegarde Restic obligatoire, contrôle d’intégrité, validation de disponibilité et récupération automatique
- Auto-mise à jour via socket Unix ou Docker Socket Proxy de confiance, avec contrôle de l’espace disque et protection tant que des modifications Compose ou `.env` ne sont pas enregistrées
- Chronologie persistante du self-update en 8 étapes, avec charge de l’hôte en direct
- Détection fiable du conteneur courant avec des valeurs Compose `hostname:` personnalisées, et état dégradé visible si la vérification est impossible

### Sécurité & authentification
- Comptes locaux avec 2FA TOTP facultative, secrets chiffrés, codes de récupération à usage unique et révocation des sessions
- Comptes locaux limités avec permissions par instance, stack et service, et espace de travail dédié ([guide](docs/scoped-users.md)) ; désactivez-les avant de revenir à une ancienne version d’Enhanced
- Authentification par trusted proxy limitée aux réseaux explicitement autorisés, avec identités du proxy associées aux comptes locaux
- Connexion OIDC native (Pocket ID, Authentik, Keycloak…) avec PKCE, comptes limités par défaut et correspondance admin facultative par utilisateur ou par groupe ([guide](docs/oidc.fr.md))
- Création non interactive du premier administrateur depuis un fichier secret
- Protection de la connexion par Cloudflare Turnstile
- Analyse de vulnérabilités Trivy avec exceptions CVE
- Validation centralisée des noms de stacks contre les traversées de chemin
- Sidecar d’auto-mise à jour restreint avec plan de mise à jour signé
- Transfert chiffré des identifiants de registres privés
- Protections et confirmations autour des opérations destructives
- Contrôles des magasins de certificats TLS après l’incident eMudhra ([contrôles TLS](security/emudhra/README.md))

### Supervision
- Statistiques CPU, RAM et disque du système, des stacks et des conteneurs, avec barre d’état configurable
- Détails du système hôte, températures et partitions disque surveillées
- Historique CPU/RAM facultatif toutes les 5 minutes pour l’hôte et par service Compose, avec interruptions visibles
- Cartes de santé du tableau de bord, détection des crash loops et auto-heal des healthchecks
- Logs en direct responsives et plein écran avec filtre par service, recherche, périodes, **depuis le dernier redémarrage**, copie des 50 / 100 / 150 dernières lignes ou de tout le chargé, pause du défilement, gestion des lignes longues et horodatage par défaut facultatif
- Mode basse consommation pour les NAS et petits hôtes
- Intégrations facultatives Kula, Dozzle, PowerWatch et PowerWatch Hub, avec la puissance PowerWatch affichée sur les instances liées

### Ressources Docker
- Images, volumes, réseaux et conteneurs non gérés, avec recherche
- Gestion des réseaux `bridge`, `macvlan` et `ipvlan`
- Nettoyage manuel et automatique unifié des images, réseaux, volumes et caches de build, avec aperçus, exclusions et historique
- Rattrapage exact des échéances et classification par Image ID
- Protection des conteneurs actifs et arrêtés, des images de rollback et de récupération et des images récentes de Dockge-Enhanced

### Recherche & fichiers
- Recherche globale multi-instance (`Ctrl+K`) dans les stacks, fichiers Compose/`.env`, ressources Docker et snapshots Restic récents
- Recherche facultative dans les valeurs `.env`, jamais renvoyées ni enregistrées dans l’historique
- Lignes compactes des volumes montés avec leur taille, et navigateur/éditeur de volumes pour chaque conteneur, même lorsque la stack est arrêtée
- Gestionnaire facultatif de fichiers hôte limité à une racine, avec transferts par morceaux, édition de texte et lecture de fichiers journaux

### Automatisation & audit
- Jetons d’API REST limités par permissions et par stack
- Webhooks par stack
- Intégration personnalisée et exemples Home Assistant facultatifs
- Historique d’audit centralisé avec origine, statut et durée
- Guides : [API REST, webhooks et Home Assistant](docs/AUTOMATION.fr.md) · [Intégration Home Assistant](docs/HOME-ASSISTANT.md)

### Intégrations
- Zerobyte : installation gérée ou connexion externe
- PowerWatch et PowerWatch Hub : observation externe ou déploiement géré
- PlugNPiN pour Nginx Proxy Manager, Pi-hole et AdGuard Home
- Dozzle
- Kula
- Home Assistant

### Apparence & langues
- Palettes jour et nuit distinctes, y compris les thèmes d’origine de Dockge-Enhanced
- Options Catppuccin, Nord, Solarized, Dracula, Gruvbox, Tokyo Night et Rosé Pine
- Préférences enregistrées dans le navigateur et mode Auto qui suit le système
- Fonctionnalités d’Enhanced traduites en anglais, français, allemand, espagnol et chinois simplifié ; les autres langues de l’interface utilisent l’anglais pour ces ajouts

### Notifications & accès
- Notifications Discord et Apprise, localisées en EN / FR / ES / zh-CN
- Nom de l’instance dans les notifications et liens `DOCKGE_PUBLIC_URL`
- Annonces opérationnelles distantes et journal persistant des nouveautés non lues
- Rapports hebdomadaires et mensuels facultatifs du comptage anonyme des installations via un webhook Discord GitHub Actions
- Clients mobiles tiers

</details>

---

## Déroulement d’une mise à jour automatique de Dockge-Enhanced

> **À distinguer d’ImageWatcher :** le mode « Immédiat » surveille les images des stacks toutes les 5 minutes. Le workflow ci-dessous concerne uniquement la mise à jour protégée de Dockge-Enhanced lui-même.

<details>
<summary>Afficher le fonctionnement de la mise à jour protégée</summary>

Dockge-Enhanced gère automatiquement le workflow complet. La WebUI détaille désormais les 8 phases réelles — préparation sécurisée, backup Restic, vérification ciblée, nettoyage des anciens snapshots, préparation de l’updater, téléchargement de l’image cible, remplacement du conteneur et healthcheck — et conserve leur durée même à travers le redémarrage du conteneur. Pendant l’opération, les compteurs Restic disponibles (octets, fichiers, débit) ainsi que CPU/RAM et la charge 1 minute de l’hôte sont affichés en direct. Les phases non mesurables utilisent un état actif et le temps écoulé plutôt qu’un faux pourcentage. Les notifications Discord/Apprise permettent aussi de suivre le résultat sans rester devant la WebUI.

L’updater prend en charge le socket Unix habituel (y compris `DOCKGE_DOCKER_SOCKET`) et un Docker Socket Proxy de confiance configuré avec `DOCKER_HOST=tcp://proxy:2375`. En TCP, il ne monte aucun socket : le sidecar démarre sur un des réseaux Docker de l’instance, rejoint ensuite les réseaux supplémentaires et n’exécute le plan signé qu’après le signal confirmant tous les raccordements. Il conserve exactement le même point d’accès Docker. Le proxy doit autoriser l’inspection, la création, le démarrage, l’arrêt et la suppression de conteneurs, l’inspection/téléchargement d’images et la connexion réseau ; un proxy en lecture seule ne peut pas effectuer un self-update. Un endpoint TCP non chiffré doit rester sur un réseau interne de confiance. Les paramètres TLS sont conservés si le répertoire de certificats est monté dans Enhanced ; sinon la mise à jour s’arrête proprement avant tout remplacement.

Avant de démarrer une auto-mise à jour, Enhanced vérifie aussi qu’aucune opération sensible n’est en cours : backup ou restauration Restic, copie/déplacement/transfert de données ou réplication de stack, vérification/mise à jour d’images Docker, scan Trivy et intégration protégée d’une stack externe. Si une opération bloque la mise à jour, celle-ci passe en attente, la raison est visible dans la WebUI et envoyée via Discord/Apprise, puis le watcher la retente automatiquement.

<table>
<tr>
<td align="center" width="50%"><a href="screens/AutoUpdate-ResticVerification.png"><img src="screens/AutoUpdate-ResticVerification.png" width="100%"/></a><br/><sub><strong>1. Vérification Restic</strong> — contrôle du backup avant remplacement.</sub></td>
<td align="center" width="50%"><a href="screens/AutoUpdate-Healthcheck.png"><img src="screens/AutoUpdate-Healthcheck.png" width="100%"/></a><br/><sub><strong>2. Healthcheck</strong> — validation du nouveau conteneur.</sub></td>
</tr>
<tr>
<td align="center" width="50%"><a href="screens/AutoUpdate-Completed.png"><img src="screens/AutoUpdate-Completed.png" width="100%"/></a><br/><sub><strong>3. Mise à jour terminée</strong> — build installé et état final.</sub></td>
<td align="center" width="50%"><a href="screens/AutoUpdate-Notifications.png"><img src="screens/AutoUpdate-Notifications.png" width="100%"/></a><br/><sub><strong>4. Notifications</strong> — disponibilité, changements et confirmation finale.</sub></td>
</tr>
</table>

</details>

## Captures d'écran

<details>
<summary>Afficher les captures d’écran</summary>

<table>
  <tr>
    <td align="center" width="33%">
      <a href="screens/1.png"><img src="screens/1.png" width="100%"/></a>
      <sub>Tableau de bord multi-instance et état global</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/2.png"><img src="screens/2.png" width="100%"/></a>
      <sub>Vue d’une stack, Compose, conteneurs et logs</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/3.png"><img src="screens/3.png" width="100%"/></a>
      <sub>Gestion détaillée d’une stack et de ses actions</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/4.png"><img src="screens/4.png" width="100%"/></a>
      <sub>Assistant de copie/migration — sélection des données</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/5.png"><img src="screens/5.png" width="100%"/></a>
      <sub>Assistant de copie/migration — préparation du transfert</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/6.png"><img src="screens/6.png" width="100%"/></a>
      <sub>Assistant de copie/migration — mapping et validation des volumes</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/7.png"><img src="screens/7.png" width="100%"/></a>
      <sub>Vue stack avec outils d’exploitation avancés</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/8.png"><img src="screens/8.png" width="100%"/></a>
      <sub>Surveillance des mises à jour d’images</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/9.png"><img src="screens/9.png" width="100%"/></a>
      <sub>État détaillé des images surveillées</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/10.png"><img src="screens/10.png" width="100%"/></a>
      <sub>Planification du démarrage et de l’arrêt des stacks</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/11.png"><img src="screens/11.png" width="100%"/></a>
      <sub>Analyse de sécurité et résultats Trivy</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/12.png"><img src="screens/12.png" width="100%"/></a>
      <sub>Configuration des sauvegardes Restic</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/13.png"><img src="screens/13.png" width="100%"/></a>
      <sub>Volumes inclus, exclusions et cohérence des sauvegardes</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/14.png"><img src="screens/14.png" width="100%"/></a>
      <sub>Gestion des ressources Docker</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/15.png"><img src="screens/15.png" width="100%"/></a>
      <sub>Supervision, monitoring et état des conteneurs</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/16.png"><img src="screens/16.png" width="100%"/></a>
      <sub>Interface responsive / affichage mobile</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/17.png"><img src="screens/17.png" width="100%"/></a>
      <sub>Historique et journal d’audit</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/18.png"><img src="screens/18.png" width="100%"/></a>
      <sub>Paramètres de sécurité et d’authentification</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/19.png"><img src="screens/19.png" width="100%"/></a>
      <sub>Intégrations facultatives</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/20.png"><img src="screens/20.png" width="100%"/></a>
      <sub>Automatisation, API et webhooks</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/21.png"><img src="screens/21.png" width="100%"/></a>
      <sub>À propos et informations de version</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/EnhancedUpdate.png"><img src="screens/EnhancedUpdate.png" width="100%"/></a>
      <sub>Mise à jour intégrée de Dockge Enhanced</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordUpdates.png"><img src="screens/DiscordUpdates.png" width="100%"/></a>
      <sub>Discord — alertes de mises à jour d’images</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordTrivy.png"><img src="screens/DiscordTrivy.png" width="100%"/></a>
      <sub>Discord — alertes de sécurité Trivy</sub>
    </td>
  </tr>
  <tr>
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

</details>

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
      - TZ=Europe/Paris                      # fuseau du processus facultatif ; planifications réglables dans la WebUI
```

```bash
docker compose up -d
```

Ouvrez **http://localhost:5001**, créez votre compte administrateur, puis cliquez sur **Surveillance** dans la barre de navigation.

> Le volume `/backup:/backup` est optionnel mais recommandé si vous utilisez **local** comme destination Restic — indiquez `/backup` comme destination afin que les snapshots soient enregistrés dans un répertoire dédié sur l'hôte, hors du conteneur.

> **Vous souhaitez sauvegarder plusieurs répertoires de données ?** Ajoutez autant de volumes que nécessaire (par ex. `../../media:/media-data`), puis sélectionnez les chemins montés dans **Sauvegarde → Volumes Docker à sauvegarder** ; Restic les inclut à chaque sauvegarde. Voir le [guide Restic](docs/restic.fr.md).

> **Vous souhaitez surveiller une partition autre que `/` ?** Les statistiques du disque sont lues depuis l'intérieur du conteneur avec `df`. Pour surveiller un chemin hôte comme `/mnt/data`, montez-le en lecture seule et ajoutez-le dans l'onglet **Monitoring** sous *Partitions disque surveillées* :
> ```yaml
>       - /mnt/data:/mnt/data:ro
> ```

**PowerWatch et PowerWatch Hub sont facultatifs** : aucun service supplémentaire n’est à ajouter au Compose ci-dessus. Après installation, ouvrez **Surveillance → Monitoring** (`/watcher/monitoring`) pour utiliser des instances existantes ou installer séparément les services gérés. Les instances protégées sont prises en charge : renseignez leur jeton API Bearer en lecture seule dans Monitoring → PowerWatch. Les instances sans authentification fonctionnent toujours sans jeton.

### Tester Dockge-Enhanced à côté de Dockge

Dockge et Dockge-Enhanced peuvent fonctionner sur le même hôte Docker, mais leurs configurations Compose par défaut ne peuvent pas être utilisées telles quelles, car les deux publient le port `5001`.

Pour les tester côte à côte :

- installez Dockge-Enhanced depuis un répertoire Compose séparé ;
- utilisez un autre port sur l'hôte, par exemple `5002:5001` ;
- utilisez un répertoire `/app/data` séparé ;
- utilisez de préférence un répertoire de stacks séparé avec une stack dédiée au test.

Exemple :

```yaml
ports:
  - 5002:5001
volumes:
  - ./enhanced-data:/app/data
  - /opt/dockge-enhanced-test-stacks:/opt/stacks
environment:
  - DOCKGE_STACKS_DIR=/opt/stacks
  - DOCKGE_DATA_DIR=/app/data
```

Vous pouvez ensuite ouvrir Dockge-Enhanced sur **http://localhost:5002**, tout en conservant votre installation Dockge existante sur le port `5001`.

Les deux applications peuvent accéder au même répertoire de stacks, mais elles ne doivent jamais modifier, déployer, mettre à jour ou effectuer une autre opération sur la même stack **simultanément**. Pour un test prudent, il est préférable d'utiliser un répertoire de stacks séparé.

### Migrer de Dockge vers Dockge-Enhanced

La migration est simple, car Dockge-Enhanced partage la même base que Dockge :

1. Arrêtez Dockge.
2. Sauvegardez le fichier Compose, le répertoire de données et le répertoire de stacks de Dockge.
3. Dans le fichier Compose existant de Dockge, remplacez l'image par :

   ```yaml
   image: ghcr.io/aerya/dockge-enhanced:latest
   ```

4. Conservez les montages existants pour `/app/data` et le répertoire de stacks.
5. Téléchargez l'image et redémarrez le projet Compose :

   ```bash
   docker compose pull
   docker compose up -d
   ```

Dockge-Enhanced démarrera avec votre compte, vos paramètres et vos stacks existants.

Conservez la sauvegarde réalisée avant la migration. Si vous souhaitez revenir à Dockge, arrêtez Dockge-Enhanced et restaurez cette sauvegarde avant de redémarrer l'image Dockge d'origine.

### Intégration PlugNPiN facultative

<details>
<summary>Afficher les instructions de configuration</summary>

Ouvrez **Paramètres → Intégrations** pour configurer [PlugNPiN](https://github.com/DeepSpace2/PlugNPiN). L’intégration reste totalement inactive tant que **Activer PlugNPiN** n’est pas sélectionné et sauvegardé. Son activation crée la stack gérée `plugnpin-dockge-enhanced` ; sa désactivation exécute Compose down puis retire le dossier généré.

Les identifiants Nginx Proxy Manager sont obligatoires pour PlugNPiN. Pi-hole, AdGuard Home, les métriques et les logs debug restent facultatifs et indépendants. Les mots de passe sont écrits via l’entrée standard dans le volume Docker dédié `dockge_enhanced_plugnpin_secrets` ; ils ne sont jamais renvoyés au navigateur ni inclus dans le Compose généré.

Pour publier un service, éditez sa stack puis utilisez **Publication PlugNPiN (facultative)** sous l’éditeur Compose. L’assistant génère et peut appliquer les labels obligatoires `plugNPiN.ip` et `plugNPiN.url`, ainsi que les options NPM sélectionnées. Les commentaires et labels existants sous forme de mapping sont préservés. Pour les labels sous forme de liste, Dockge fournit volontairement uniquement le YAML à copier au lieu de réécrire la structure existante.

> La désactivation du contrôleur arrête ses conteneurs, mais ne peut pas garantir la suppression immédiate des entrées qu’il a créées lorsque les conteneurs applicatifs étiquetés fonctionnent encore. Retirez les labels ou arrêtez les applications concernées pendant que PlugNPiN fonctionne si ces entrées doivent d’abord être supprimées.

> PlugNPiN `1.0.0` est actuellement publié en amont uniquement pour `amd64`. Dockge maintient l’intégration désactivée avec un message explicite sur les architectures non prises en charge ; le reste de Dockge Enhanced demeure multi-architecture.

</details>

---

## Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `DOCKGE_STACKS_DIR` | `/opt/stacks` | Dossier contenant les stacks Docker Compose |
| `COMPOSE_FILENAME` | `compose.yaml` | COMPOSE_FILENAME choisit compose.yaml (par défaut), compose.yml, docker-compose.yaml ou docker-compose.yml uniquement pour les nouvelles stacks. Les stacks existantes et adoptées conservent leurs fichiers. Les autres noms et chemins sont refusés. |
| `DOCKGE_DATA_DIR` | `/app/data` | Dossier de données Dockge ; ne le modifier que pour un montage persistant personnalisé |
| `DOCKGE_PUBLIC_URL` | *(aucun)* | URL publique utilisée dans les liens des notifications Discord (ex : `https://dockge.mondomaine.fr`) |
| `DOCKER_API_VERSION` | *(aucun)* | Fixe la version d'API Docker négociée par le client — utile sur certains NAS (ex : Synology DSM 7.x) |
| `TZ` | `UTC` | Fuseau du processus dans le conteneur ; utilisé par défaut tant qu’aucun fuseau n’est choisi dans **Paramètres → Général**. Le choix WebUI est prioritaire pour les planifications d’Enhanced. |
| `DOCKGE_PORT` | `5001` | Port de la WebUI |
| `DOCKGE_SSL_KEY` / `DOCKGE_SSL_CERT` | — | Activer HTTPS |
| `DOCKGE_AUTH_MODE` | *(non défini)* | Mode d’authentification : `local`, `disabled` ou `trusted-proxy`. Non défini, le comportement historique et le réglage `disableAuth` sont conservés |
| `DOCKGE_AUTH_PROXY_HEADER` | `x-forwarded-user` | Header contenant l’identité validée par le proxy en mode `trusted-proxy` |
| `DOCKGE_AUTH_PROXY_TRUSTED_NETWORKS` | *(requis en mode proxy)* | Adresses ou CIDR autorisés à fournir le header d’identité, séparés par des virgules |
| `DOCKGE_BOOTSTRAP_USERNAME` | *(aucun)* | Nom du premier administrateur à créer uniquement si la base ne contient encore aucun utilisateur |
| `DOCKGE_BOOTSTRAP_PASSWORD_FILE` | *(aucun)* | Fichier secret contenant son mot de passe ; recommandé pour un bootstrap automatisé |
| `DOCKGE_BOOTSTRAP_PASSWORD` | *(aucun)* | Alternative directe au fichier secret, moins sûre car visible dans l’environnement du conteneur |
| `DOCKGE_TRANSFER_RSYNC_PROFILES` | `[]` | Tableau JSON de profils SSH/rsync locaux (`label`, `host`, `port`, `user`, `path`, `keyPath`, `bandwidthKbps` optionnel). Configurer la même identité de destination sur les deux instances ; les chemins de clés ne quittent jamais leur instance |
| `DOCKGE_AUTH_PROXY_ADMIN_USERS` | *(aucun)* | Identités du proxy, séparées par des virgules, créées comme administrateurs à leur première connexion en mode `trusted-proxy` ; les autres nouvelles identités sont limitées et sans droits |
| `DOCKGE_REVERSE_HUB_URL` | *(aucun)* | Origine du serveur central pour une connexion inversée facultative (HTTP(S), sans chemin) ; voir le [guide des agents inversés](docs/compose-and-reverse-agents.fr.md) |
| `DOCKGE_REVERSE_TOKEN_FILE` / `DOCKGE_REVERSE_TOKEN` | *(aucun)* | Jeton propre au nœud pour la connexion inversée ; le fichier est prioritaire et recommandé |
| `DOCKGE_FILE_MANAGER_ROOT` | *(aucun)* | Chemin du conteneur exposé par le gestionnaire de fichiers hôte facultatif ; désactivé si non défini |
| `DOCKGE_FILE_MANAGER_MAX_FILE_SIZE` | `104857600` | Taille maximale des transferts du gestionnaire de fichiers hôte, en octets (100 Mio) |
| `DOCKGE_DOCKER_SOCKET` | `/var/run/docker.sock` | Chemin du socket Docker, par exemple pour Docker rootless ou Podman |
| `DOCKER_HOST` | *(aucun)* | Point d’accès Docker, par exemple `tcp://proxy:2375` avec un Docker Socket Proxy de confiance |
| `DOCKGE_CONTAINER_ID` | *(aucun)* | ID explicite du conteneur Enhanced lorsqu’il ne peut pas être déduit de `HOSTNAME` |
| `DOCKGE_USAGE_COUNT` | *(activé)* | Mettre `false` pour désactiver le comptage mensuel anonyme des installations |
| `DOCKGE_OIDC_ISSUER` | *(aucun)* | URL de l’émetteur OpenID Connect ; la définir active la connexion OIDC native. Toutes les options `DOCKGE_OIDC_*` sont décrites dans le [guide OIDC](docs/oidc.fr.md) |

> ℹ️ Sans `DOCKGE_DATA_DIR`, Dockge-Enhanced utilise son volume persistant `/app/data`. Un chemin explicitement configuré reste toujours prioritaire.

> ℹ️ `DOCKGE_PUBLIC_URL` est optionnel. Si absent, les notifications Discord sont envoyées sans lien. Compatible avec les reverse proxies et les domaines HTTPS.

> Les profils SSH/rsync exigent que la clé privée et un fichier `known_hosts` déjà rempli soient montés en lecture seule dans chaque instance Dockge participante. `StrictHostKeyChecking=yes` reste toujours imposé ; aucun mot de passe ni commande distante arbitraire ne peut être fourni depuis la WebUI.

### Authentification et premier setup

**Installation existante : rien à changer.** Sans les variables ci-dessus, les comptes, la page de connexion, la 2FA et le réglage **Désactiver l’authentification** fonctionnent comme avant. Au premier démarrage d’une installation neuve, ouvrez simplement `/setup` et créez l’administrateur. Une fois l’installation terminée, le serveur refuse toute nouvelle tentative de setup, même si l’URL SPA reste connue.

Pour un bootstrap non interactif, montez de préférence un secret puis renseignez uniquement ces variables optionnelles :

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

Remplacez le CIDR d’exemple par le réseau exact du proxy et configurez celui-ci pour transmettre l’en-tête choisi. Le port Dockge ne doit pas être directement accessible : seuls les proxies déclarés peuvent fournir une identité. Chaque identité du proxy utilise le compte local portant le même nom : un compte limité restreint cet utilisateur, un compte administrateur conserve l’accès complet. Une identité sans compte est créée comme compte limité sans droits, sauf le premier utilisateur d’une installation neuve et les identités listées dans `DOCKGE_AUTH_PROXY_ADMIN_USERS`, qui deviennent administrateurs. Les comptes existants conservent leur rôle, et un changement de rôle ou une désactivation peut mettre jusqu’à 30 secondes à s’appliquer aux sessions passant par le proxy. La gestion des comptes reste disponible uniquement en authentification locale. N’exemptez jamais `/setup`, `/socket.io` ou `/api/*` de l’authentification ; le proxy doit transmettre les WebSockets et protéger tout l’hôte.

### Connexion OIDC native (Pocket ID, Authentik, Keycloak…)

Sans reverse proxy, Dockge-Enhanced peut connecter les utilisateurs directement avec un fournisseur OpenID Connect, en plus des comptes locaux et de la 2FA :

```yaml
environment:
  - DOCKGE_OIDC_ISSUER=https://id.example.com
  - DOCKGE_OIDC_CLIENT_ID=dockge
  - DOCKGE_OIDC_CLIENT_SECRET_FILE=/run/secrets/dockge_oidc_secret
  - DOCKGE_OIDC_REDIRECT_URI=https://dockge.example.com/api/auth/oidc/callback
  - DOCKGE_OIDC_ADMIN_GROUPS=dockge-admins
```

Les nouveaux utilisateurs OIDC sont des comptes limités sans aucun accès tant qu’un administrateur ne leur en donne pas, sauf s’ils font partie de `DOCKGE_OIDC_ADMIN_GROUPS` ou `DOCKGE_OIDC_ADMIN_USERS`. Personne ne devient administrateur implicitement : sur une installation neuve, créez le premier administrateur avec `/setup` ou `DOCKGE_BOOTSTRAP_*`, ou configurez une correspondance admin, sinon la première connexion OIDC est refusée. Un compte local existant n’est jamais rattaché sans `DOCKGE_OIDC_LINK_EXISTING=true`. L’OIDC ne fonctionne qu’en authentification locale et ne demande pas le code TOTP local. `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN=true` ne laisse que le bouton SSO ; si le fournisseur devient indisponible, retirez cette variable et redémarrez le conteneur. [Toutes les options, exemples par fournisseur et récupération](docs/oidc.fr.md).

---

## Mises à jour automatiques

Ce fork suit les releases stables de Dockge automatiquement via GitHub Actions :
- **Chaque jour** — vérifie si une nouvelle version est disponible
- **Si oui** — merge les changements upstream et crée une PR
- **Au merge** — rebuild et publie les images Docker (`amd64` + `arm64`) sur GHCR
- **En cas de conflit d’authentification** — conserve temporairement la version Enhanced dans la branche de synchronisation et signale explicitement les fichiers à comparer avant le merge

Le créneau configuré dans l’onglet **Mises à jour** est global : lorsqu’il est activé pour l’auto-mise à jour de Dockge-Enhanced, il encadre aussi toutes les mises à jour automatiques d’images. Les images détectées hors des jours et heures autorisés restent en attente. Les actions manuelles **Mettre à jour** ne sont jamais retardées par ce créneau.

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

- [**Apprise**](https://github.com/caronc/apprise-api) — passerelle de notifications multi-plateformes
- [**darthrater78/dockge**](https://github.com/darthrater78/dockge) / [**ha-dockge**](https://github.com/darthrater78/ha-dockge) — inspiration pour la détection des conflits de ports, le contrôle des écarts Compose et l’intégration Home Assistant.
- [**crossly/Dockge-Enhanced**](https://github.com/crossly/Dockge-Enhanced) — source d’améliorations importantes de l’UI/UX, des thèmes, de l’internationalisation et de l’architecture frontend adaptées dans ce projet
- [**Dockge**](https://github.com/louislam/dockge) par louislam — le projet d'origine (licence MIT)
- [**Dozzle**](https://github.com/amir20/dozzle) par Amir Rajan — visualisation en temps réel des logs Docker (licence MIT)
- [**hamphh/dockge**](https://github.com/hamphh/dockge) par hamphh — inspiration et labels compatibles pour les exclusions par service du statut global et des mises à jour d’image
- [**Isurupro7**](https://github.com/Isurupro7) / [**Dockge #1006**](https://github.com/louislam/dockge/pull/1006) — inspiration pour les limites CPU/RAM facultatives par service, adaptées sans modifier les permissions des comptes limités
- [**RichyHBM**](https://github.com/RichyHBM) / [**Dockge #84**](https://github.com/louislam/dockge/pull/84) — Nom du fichier Compose par défaut.
- [**Kula**](https://github.com/c0m4r/kula) par c0m4r — monitoring système léger (AGPLv3)
- [**Lorwell/dockge**](https://github.com/Lorwell/dockge) par Lorwell — inspiration pour le gestionnaire de fichiers hôte restreint et la vue par conteneur réel adaptés à Enhanced (licence MIT)
- [**PlugNPiN**](https://github.com/DeepSpace2/PlugNPiN) par DeepSpace2 — automatisation optionnelle du DNS et de Nginx Proxy Manager (GPLv3)
- [**PowerWatch**](https://github.com/Aerya/PowerWatch) — projet de monitoring électrique Linux et Hub d’agrégation, intégrés en option à Enhanced
- [**Restic**](https://restic.net/) — outil de backup chiffré
- [**Trivy**](https://github.com/aquasecurity/trivy) — scanner de vulnérabilités
- [**Zerobyte**](https://github.com/nicotsx/zerobyte) — application de sauvegarde fondée sur Restic, connectée ou déployée en option par Enhanced

---

## Licence

MIT — voir [LICENSE](LICENSE).
