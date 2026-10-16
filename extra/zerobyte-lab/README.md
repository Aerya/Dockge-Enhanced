# Exercices Zerobyte isolés

Ce lanceur vérifie un workflow fictif existant : backup avec reprise applicative, panne avant backup, panne pendant backup. Il refuse le port 5001, exige une URL de boucle locale et le label `dockge.test=zerobyte-<identifiant>` sur Enhanced. Tous les jobs doivent être désactivés. Il n’arrête jamais le démon Docker, l’hôte, Enhanced ou Zerobyte.

Créer les fixtures et l’instance de test via Enhanced, avec comptes, volumes, ports et réseaux dédiés. Préparer une source contenant uniquement des fichiers fictifs ; pour couper pendant l’exécution, prévoir assez de données pour observer l’arrêt applicatif. Créer le workflow protégé avec l’assistant. Le serveur de stockage doit appartenir à un projet Compose `zerobyte-…fixture` ou `zerobyte-…validation` distinct des applications. Ne jamais utiliser de données ou de dépôt réels, notamment si une politique de rétention existe.

Créer hors du dépôt un manifeste JSON (ne pas le committer) :

```json
{
  "workflowId": "identifiant-du-workflow-fictif",
  "jobId": "identifiant-du-job-fictif",
  "apps": ["zerobyte-application-fixture-app-1"],
  "idle": ["zerobyte-application-fixture-idle-1"],
  "server": "zerobyte-network-fixture-sftp-1",
  "network": "zerobyte-network-fixture_default"
}
```

Fournir le jeton Enhanced dans un fichier privé hors du dépôt. Exécuter les exercices séparément :

```sh
export DOCKGE_LAB_URL=http://127.0.0.1:5055
export DOCKGE_LAB_TOKEN_FILE=/chemin/prive/jeton
export DOCKGE_LAB_MANIFEST=/chemin/prive/manifeste.json
export DOCKGE_LAB_CONFIRM='FICTITIOUS DATA ONLY'
node extra/zerobyte-lab/check.mjs smoke
node extra/zerobyte-lab/check.mjs network-before
node extra/zerobyte-lab/check.mjs network-during
```

Le réseau est reconnecté dans le bloc de récupération, y compris après une assertion échouée. Un processus tué de force ne peut pas exécuter ce bloc : dans ce cas, reconnecter exclusivement le conteneur et le réseau de fixture indiqués. Le résultat JSON ne contient aucun jeton.

Les pannes NFS/SMB distantes, la lecture seule, les permissions, l’espace épuisé et Docker inaccessible nécessitent des fixtures supplémentaires. Utiliser un relais réservé au test, un système de fichiers de taille limitée ou le seul conteneur de stockage fictif. Vérifier le refus avant arrêt, la récupération après interruption et l’absence d’accumulation de sondes. Ne pas arrêter un serveur NFS ou un démon Docker partagé avec la production.
