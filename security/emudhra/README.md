# eMudhra — validation des images (23 octobre 2026)

Référence : https://emudhra.we-have-a-problem.com/

Les images reconstruites actualisent le magasin système et, selon le projet,
le runtime ou le bundle embarqué. Aucune désactivation de la validation TLS.
Un déploiement existant ne change pas tant que son image n’est pas remplacée.

Le workflow `Régression TLS eMudhra` reconstruit sans cache et sans publication.
Il vérifie le bundle de l’image hors ligne avec les 14 chaînes publiques,
à la date de l’incident pour éviter un faux succès lié à l’expiration.
Il teste ensuite les 14 hôtes, dont les deux No CT, avec le client natif,
et exige une connexion valide à `example.com`. Une erreur DNS, un timeout
ou une erreur d’expiration ne vaut pas protection.

Les fichiers `chains/` proviennent de l’archive publique
https://emudhra.we-have-a-problem.com/chains.zip ; ils ne contiennent que des
certificats publics. Aucun secret ni donnée de déploiement n’est utilisé.

Cette validation couvre les magasins et clients indiqués dans le workflow,
pas tous les navigateurs, plugins, binaires tiers ou parcours métier possibles.
Les tests applicatifs habituels restent nécessaires avant fusion.
