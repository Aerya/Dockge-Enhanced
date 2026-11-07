# Catalogue d’applications (BÊTA)

[English](application-catalog.md) · [Français](application-catalog.fr.md) · [Deutsch](application-catalog.de.md) · [Español](application-catalog.es.md) · [简体中文](application-catalog.zh-CN.md)

## Parcourir et choisir

Tous les dépôts sont activés par défaut et chargés progressivement à l’ouverture d’Applications. Désactivez ceux de votre choix dans Gérer les dépôts. Les catégories disposent d’une recherche dédiée et d’une liste à hauteur limitée avec défilement, distincte de la recherche d’applications. Choix enregistrés par compte sur cette instance.

Les noms d’applications identiques proposent un choix de source ; les modèles ne sont pas interchangeables. Sites et logos apparaissent lorsqu’ils sont fournis par la source. Actualisez explicitement le catalogue ; les stacks existantes ne sont jamais modifiées.

## Vérifier avant de déployer

Seuls les administrateurs accèdent au catalogue. L’import crée un brouillon Compose/.env éditable ; choisissez l’instance cible dans l’éditeur, vérifiez puis déployez explicitement. Aucun compte ni installation Portainer requis. Swarm, Windows et les options d’exécution Portainer non prises en charge sont refusés plutôt qu’ignorés.

Les modèles natifs Umbrel, Runtipi, RoqueOS et Yundera peuvent dépendre de variables, services proxy, chemins, secrets, réseaux et fichiers propres à leur plateforme. Enhanced n’exécute pas les hooks des dépôts, n’installe pas leurs services système et ne télécharge pas les fichiers complémentaires. Ces brouillons nécessitent une adaptation ; un import réussi ne garantit pas le fonctionnement. Les modèles TrueNAS utilisent son moteur de rendu et restent consultables uniquement.

Vérifiez architecture des images, ports, montages, privilèges et secrets, y compris les valeurs proposées. Sauvegardez les données importantes avant déploiement. Les requêtes du catalogue ciblent uniquement GitHub public, avec limites de taille et de durée, sans redirection. Les logos sont chargés par votre navigateur depuis leurs hébergeurs sans référent ; les liens s’ouvrent séparément. Les métadonnées peuvent être incomplètes ou rester dans leur langue d’origine.

## Sources et maintenance

Chaque dépôt source maintient ses applications et modèles. Enhanced fournit les adaptateurs de consultation/import, pas la maintenance des applications ni une certification de compatibilité. Le catalogue est en BÊTA.

- [Lissy93](https://github.com/Lissy93/portainer-templates)
- [Portainer](https://github.com/portainer/templates)
- [Pi-Hosted](https://github.com/pi-hosted/pi-hosted)
- [LinuxServer / Technorabilia](https://github.com/technorabilia/portainer-templates)
- [TrueNAS](https://github.com/truenas/apps)
- [Umbrel](https://github.com/getumbrel/umbrel-apps)
- [Runtipi](https://github.com/runtipi/runtipi-appstore)
- [RoqueOS](https://github.com/roqueribeiro/roqueos-containers-list)
- [Yundera](https://github.com/Yundera/AppStore)

