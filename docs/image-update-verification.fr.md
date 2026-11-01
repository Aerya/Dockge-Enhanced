# Vérification des mises à jour d’images

[English](image-update-verification.md) · [Français](image-update-verification.fr.md) · [Deutsch](image-update-verification.de.md) · [Español](image-update-verification.es.md) · [简体中文](image-update-verification.zh-CN.md)

> Correctif proposé dans cette branche ; pas encore publié.

ImageWatcher retrouve les images dont le tag local a disparu, vérifie chaque réplica ciblé après Compose et signale les divergences comme des échecs. Une mise à jour non vérifiable ne fait plus avancer la date. Les images téléchargées restent protégées de la purge pendant 24 heures après une tentative interrompue ou non vérifiée.

L’ID immuable attendu est capturé après le pull, avant la recréation. Chaque service ciblé ordinaire doit conserver son nombre de réplicas ; chacun doit fonctionner, ne pas être unhealthy et utiliser cet ID. Les services partageant un namespace réseau sont inclus. Les services en mise à jour progressive conservent leurs contrôles de santé et de drainage ; une fin de drainage en attente reste explicitement non vérifiée et ne fait pas avancer la date.

Un tag local absent est retrouvé via l’image du conteneur en cours. Les erreurs de registre ou d’inspection restent un état inconnu, jamais à jour. Une divergence confirmée est un échec ; une vérification impossible est affichée comme non vérifiée. Aucun de ces résultats ne compte comme une mise à jour réussie ni ne fait avancer lastUpdated.

La purge et les mises à jour d’images s’excluent mutuellement. Avant le pull, Enhanced enregistre une protection de la référence cible, puis l’ID de l’image téléchargée. Une tentative interrompue ou non vérifiée conserve cette protection pendant 24 heures, même après redémarrage. Une réussite vérifiée libère uniquement la protection de cette opération. Le délai part de la tentative ou du téléchargement, pas de la date de construction de l’image ; la purge normale des images inutilisées peut reprendre après expiration.

La date de stack porte le libellé « Dernière opération » avec une infobulle explicative. Elle décrit une opération sur la stack, éventuellement un seul service, sans garantir que tous les services sont à jour. Les résultats par image restent dans l’historique Watcher. Pauses, exclusions, fenêtres de maintenance et rollback restent respectés.
