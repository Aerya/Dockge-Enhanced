# Docker rollout

[English](service-rollout.md) · [Français](service-rollout.fr.md) · [Deutsch](service-rollout.de.md) · [Español](service-rollout.es.md) · [简体中文](service-rollout.zh-CN.md)

## Mise en place

Choisissez Traefik natif si la découverte Docker existante et les prérequis de retrait du trafic sont satisfaits. Sinon, dans l’éditeur du service, indiquez son **port TCP interne**, puis cliquez sur **Préparer un relais facultatif**. Vérifiez le brouillon avant d’enregistrer et de déployer : le port publié et les labels Traefik/PlugNPiN passent sur un service relais distinct. Le déploiement initial peut interrompre le trafic. Gardez la destination du proxy si elle utilise cette IP hôte et ce port publié ; si elle utilise le nom du service applicatif, remplacez-la explicitement par le nom du relais.

Le relais utilise Nginx stream sans terminer TLS ni exposer d’API d’administration. HTTP, TLS et WebSocket peuvent transiter sur TCP ; UDP/QUIC n’est pas pris en charge. Aucun identifiant d’API NPM, Caddy ou HAProxy n’est nécessaire. Il s’agit d’une compatibilité de protocole, pas d’une certification de chaque produit/version. L’intégration native cible actuellement Traefik. Le relais possède un volume de configuration persistant et un réseau/alias dédié : ne les supprimez pas pendant son utilisation. Sauvegardez cette configuration avec la stack.

## Récupération et limites

Des healthchecks et des ressources CPU/RAM supplémentaires sont nécessaires. Les noms de conteneurs fixes, volumes partagés en écriture et consommateurs d’espaces de noms restent incompatibles. L’assistant refuse les variables/plages de ports ambiguës, profiles et extends plutôt que de deviner. Les limites CPU/RAM existantes sont conservées. Les connexions voient l’IP du relais ; les applications exigeant l’IP client originale nécessitent une configuration de proxy de confiance étudiée séparément.

Pendant les mises à jour applicatives, le relais n’est pas recréé. Les nouvelles connexions ne basculent qu’après validation des remplaçants sains. Les connexions existantes peuvent se terminer sur l’ancienne génération. Après environ deux minutes de retrait, une connexion persistante produit une opération incomplète : les conteneurs sont conservés et le routage revient aux anciens réplicas sains lorsque c’est possible. Examinez et réconciliez ces réplicas avant de réessayer ; ne supprimez pas un conteneur servant encore des clients. Le redémarrage du relais lui-même, Recreate et le rollback ne sont pas sans interruption.

Mettez les deux côtés des instances liées à jour. Un compte restreint doit disposer des droits de mise à jour sur l’application **et son relais**. Ouvrir l’éditeur ne change rien ; préparer un relais ne modifie que le brouillon. Désactiver les mises à jour progressives ne démonte pas le relais et ne remet pas les ports à leur ancienne place : cette migration doit être examinée explicitement. Aucune configuration de proxy de production n’est modifiée automatiquement.

Les mises à jour progressives n’ajoutent plus de fichier Compose de surcharge ni de label temporaire : un Déployer ultérieur sans changement conserve le conteneur. Au démarrage du relais, si la configuration persistée n’est plus valide (par exemple après un down/up ayant supprimé les anciens noms de conteneurs), elle est remplacée par la configuration initiale du Compose, après validation. Une configuration encore valide est conservée. Cela corrige la boucle de redémarrage sur un nom disparu, mais ne constitue pas encore une réconciliation automatique complète d’une opération interrompue. Les actions Enhanced concurrentes sur le même dossier de stack sont refusées pendant l’opération ; les anciens réplicas volontairement retirés du trafic ne déclenchent pas l’auto-réparation pendant ce retrait.

[Wowu/docker-rollout](https://github.com/Wowu/docker-rollout) · [Dockge #170](https://github.com/louislam/dockge/pull/170) · [Nginx](https://nginx.org/en/docs/control.html)
