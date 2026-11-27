# Mises à jour des hôtes (Bêta)

[English](host-management.md) · [Français](host-management.fr.md) · [Deutsch](host-management.de.md) · [Español](host-management.es.md) · [简体中文](host-management.zh-CN.md)

Optionnel et désactivé par défaut, dans `/watcher/hosts` : inventaire et détection des mises à jour Debian/Ubuntu et Arch/Garuda, analyse CVE Debian/Ubuntu, mises à jour APT manuelles ou programmées après installation et autorisation locales. Profils : toutes les mises à jour autorisées, sécurité uniquement, prudent, sécurité et prudent. Notifications configurables pour les détections et les opérations. Rapports en lecture seule, transport par la fédération existante. Arch/Garuda restent en surveillance seule ; AUR, RPM/APK/Zypper, opérations de parc et couverture CVE complète restent indisponibles.

L’onglet Mises à jour des hôtes reste toujours visible ; seule la surveillance est désactivée par défaut.

Mises à jour regroupe Dockge-Enhanced, Images Docker et Mises à jour des hôtes (Bêta) dans trois sous-onglets visibles. Huit onglets principaux sont conservés ; les URL existantes et les liens vers les instances distantes restent valides.

## Installation et sécurité

Exécuter ces commandes localement sur l’hôte Linux choisi après lecture des scripts fournis. Ne jamais installer le collecteur dans Enhanced. Python 3 et systemd sont nécessaires. SSH n’est ni requis ni implémenté. Ne pas exécuter ces instructions en production pour tester la fonctionnalité. Installation et mises à niveau relèvent de l’administrateur local ; le hub ne peut pas remplacer ces fichiers.

```sh
sudo useradd --system --no-create-home --shell /usr/sbin/nologin dockge-host
sudo install -d -m 0755 /usr/local/lib/dockge-host
sudo install -m 0644 extra/host-management/collector.py /usr/local/lib/dockge-host/
sudo install -m 0644 extra/host-management/dockge-host-collector.service extra/host-management/dockge-host-collector.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dockge-host-collector.timer
sudo systemctl start dockge-host-collector.service
```

```yaml
services:
  dockge:
    volumes:
      - /var/lib/dockge-host-reports:/host-reports:ro
```

## Limitations et récupération

Monitor prend en charge Debian/Ubuntu et Arch/Garuda. Pacman utilise checkupdates si disponible, sinon pacman -Qu sur cache ; aucun pacman -Sy, mise à jour partielle ou traitement AUR. APT utilise le cache existant sans rafraîchissement implicite des dépôts. Un redémarrage inconnu ne signifie pas inutile. Autres OS et providers non pris en charge. Un hôte est associé à chaque instance. Le timer règle localement la collecte (6 heures) ; Enhanced lit chaque minute. Seuil d’ancienneté : 12 heures ; historique : 90 jours, configurables. Les empreintes évitent les inventaires identiques dupliqués. Les 100 dernières entrées sont affichées. Les hôtes/noms des dépôts sont expurgés ; les versions des paquets de noyaux installés sont affichées. L’origine officielle n’est reconnue que pour les miroirs publics Debian/Ubuntu non ambigus ; sinon les correspondances restent indéterminées. Cliquer sur une date d’inventaire pour comparer les ajouts, suppressions et versions avec l’inventaire précédent conservé. Les filtres avancés de parc restent indisponibles. Une empreinte de machine-id avec préfixe spécifique lie rapports et opérations ; le machine-id brut n’est jamais transmis.

L’analyse CVE est optionnelle, au plus horaire si l’inventaire change, sinon quotidienne. La même image Trivy lit une base dpkg et un os-release synthétiques ; aucun montage racine hôte ni socket Docker n’est exposé au scanner. Seul le téléchargement des bases accède au réseau ; l’analyse est hors ligne. Une base de plus de 72 heures est refusée. Résultats partiels : origines tierces, ESM et avis non reconnus ne sont pas déclarés sûrs. Une version corrigée exacte présente dans les mises à jour est disponible ; les autres correctifs publiés ont une disponibilité locale indéterminée. Aucune comparaison SemVer générique. Réévaluation quotidienne, résultats en mémoire ; après redémarrage, état inconnu jusqu’à la prochaine analyse. Trivy conserve les sources des avis ; bases téléchargées à l’exécution, non redistribuées avec Enhanced. Consulter leurs licences. CVE Arch et flux éditeurs directs non implémentés.

[Trivy SBOM](https://trivy.dev/docs/latest/target/sbom/) · [Trivy DB sources and licenses](https://github.com/aquasecurity/trivy-db/blob/main/LICENSE)

```sh
sudo systemctl disable --now dockge-host-collector.timer
sudo rm /etc/systemd/system/dockge-host-collector.timer /etc/systemd/system/dockge-host-collector.service
sudo systemctl daemon-reload
# Reports and history are retained.
```

[PatchMon](https://github.com/PatchMon/PatchMon) — Inspiration pour l’inventaire des systèmes, la surveillance et l’orchestration des mises à jour.

[PatchBase](https://github.com/patchbase/patchbase) — Inspiration pour l’inventaire des paquets, la corrélation avec les avis de sécurité et la détection des vulnérabilités.

## Exécuteur APT local

Manual doit être activé localement : installer l’exécuteur séparément, choisir les heures UTC et exclusions dans la politique appartenant à root. La politique par défaut refuse toute installation. Requêtes valables deux minutes ; simulations valables cinq minutes, recalculées avant installation. L’approbation est consommée avant exécution. Aucun shell, redémarrage, ajout de dépendance ou suppression exposé. Les verrous APT natifs restent actifs. Les configurations existantes sont conservées ; vérifier ensuite localement les fichiers .dpkg-dist. Ne pas arrêter un gestionnaire en cours d’écriture ; désactiver le timer empêche les nouvelles requêtes. Une transaction interrompue ou échouée nécessite un diagnostic local avec dpkg --audit et la procédure de récupération de la distribution. Aucun rollback universel. Un administrateur/hub compromis peut demander les mises à jour permises localement ; une compromission root de l’hôte est hors de cette frontière de confiance.

Utiliser un répertoire de requêtes appartenant à l’UID du processus Enhanced (adapter 1000). Lui seul est accessible en écriture ; les rapports d’opération restent en lecture seule. Ne jamais monter /etc/dockge-host ou l’état de l’exécuteur dans Enhanced. Le transport utilise les agents directs/inversés existants et vérifie les droits administrateur aux deux extrémités. Hub-only peut lire l’inventaire mais ne lance pas Trivy. Agent-only conserve les mêmes RPC. Les notifications et la programmation par hôte sont détaillées ci-dessous. Les opérations de parc et la sélection individuelle de paquets restent indisponibles.

```sh
sudo install -m 0644 extra/host-management/executor.py extra/host-management/apt_provider.py /usr/local/lib/dockge-host/
sudo install -d -m 0700 /etc/dockge-host /var/lib/dockge-host-executor
sudo install -d -m 0755 /var/lib/dockge-host-operations
sudo install -d -m 0700 -o 1000 /var/lib/dockge-host-requests
sudo install -m 0600 extra/host-management/policy.example.json /etc/dockge-host/policy.json
sudo install -m 0644 extra/host-management/dockge-host-executor.service extra/host-management/dockge-host-executor.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dockge-host-executor.timer
```

```json
{
  "mode": "manual",
  "allowInstall": true,
  "allowAutomatic": false,
  "allowedScopes": ["security", "conservative", "security-conservative"],
  "conservativePackages": [],
  "refreshMetadata": false,
  "utcHours": [2, 3],
  "exclusions": ["example-package"]
}
```

```yaml
services:
  dockge:
    environment:
      DOCKGE_HOST_REQUEST_DIR: /host-requests
      DOCKGE_HOST_OPERATION_REPORT_DIR: /host-operations
    volumes:
      - /var/lib/dockge-host-requests:/host-requests
      - /var/lib/dockge-host-operations:/host-operations:ro
```

```sh
sudo systemctl disable --now dockge-host-executor.timer
# Wait for any running apt/dpkg operation to complete before removing the service.
sudo rm /etc/systemd/system/dockge-host-executor.timer /etc/systemd/system/dockge-host-executor.service
sudo systemctl daemon-reload
```

## Profils, programmation et notifications

Aucune mise à jour n’est garantie sans risque de rupture. **Sécurité uniquement** sélectionne les versions des dépôts de sécurité officiels et approuvés Debian/Ubuntu avec les comparaisons natives APT. Cela ne dépend pas de la détection CVE Trivy et n’inclut pas ESM ni les dépôts tiers. **Prudent** exige une liste locale `conservativePackages`, refuse les paquets essentiels/importants et les principales familles critiques (noyau, démarrage, réseau, pilotes, Docker, bases de données). Une liste vide ne met rien à jour. **Sécurité et prudent** applique les deux restrictions. Les dépendances hors sélection, nouveaux paquets, suppressions et paquets gelés sont refusés. Une dépendance supplémentaire peut donc bloquer toute l’opération. Le profil `all` doit aussi être autorisé explicitement dans `allowedScopes` ; il n’est pas prudent.

Arch/Garuda et les distributions rolling-release peuvent rencontrer des ruptures de dépendances, pilotes ou applications et nécessiter une intervention manuelle. Lire les annonces de la distribution, sauvegarder et privilégier une mise à jour complète selon sa procédure (par exemple `garuda-update`). Les mises à jour partielles, de sécurité uniquement et automatiques des rolling-release ne sont pas proposées dans cette bêta.

Installer aussi `apt_provider.py` et le paquet système `python3-apt` pour les profils ciblés. L’exécuteur utilise `/usr/bin/python3`. `mode: manual` autorise simulation puis approbation manuelle. Pour programmer sur Debian/Ubuntu à version fixe, l’administrateur local doit choisir `mode: automatic`, `allowInstall: true`, `allowAutomatic: true`, les `allowedScopes` et les heures `utcHours`. La politique reste locale et inaccessible au hub. `refreshMetadata: true` autorise explicitement le rafraîchissement APT avant les simulations et travaux programmés ; son échec interdit l’installation. Sinon seuls les index déjà présents sont utilisés.

Dans Configuration, choisir les jours et l’heure UTC ainsi que le profil, puis enregistrer. L’exécuteur local recalcule le plan à chaque exécution et vérifie sa politique. Un créneau ne s’exécute qu’une fois ; après cinq minutes de retard, il est ignoré, sans rattrapage ni nouvelle tentative automatique après échec. Le planning continue même si le hub est déconnecté. Désactiver et enregistrer le planning avant de désactiver la surveillance. Révoquer la politique locale ou désactiver le timer empêche les nouveaux travaux ; ne jamais interrompre APT/dpkg en cours. Aucun redémarrage automatique, changement de version de distribution ni rollback universel.

Les notifications utilisent les canaux Discord/Apprise configurés dans Notifications. Leur activation est indépendante et désactivée par défaut. Choisir les événements : mises à jour, vulnérabilités avec seuil de gravité, correctifs disponibles, redémarrage nécessaire, collecteur ou données de sécurité anciens/indisponibles, démarrage, réussite, échec et modification du planning. Les événements d’installation indiquent le mode manuel/automatique, le profil et le nombre de paquets. Les alertes de détection sont dédupliquées et espacées d’une heure par type ; les opérations ne sont pas soumises à cette limite. La surveillance et l’envoi fonctionnent sans page ouverte. Les envois échoués sont réessayés tant que l’événement est conservé et les notifications actives ; un envoi réussi sur au moins un canal est considéré livré. L’exécuteur conserve les 100 derniers événements pour récupération après déconnexion ; Enhanced conserve l’historique selon sa rétention (90 jours par défaut). Ce tampon n’est pas un journal illimité.
