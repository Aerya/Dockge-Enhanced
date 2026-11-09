# Instances liées derrière un SSO

[English](sso-federation.md) · [Français](sso-federation.fr.md) · [Deutsch](sso-federation.de.md) · [Español](sso-federation.es.md) · [简体中文](sso-federation.zh-CN.md)

Une liaison facultative à sens unique permet de gérer un serveur distant sans connexion retour ni propagation dans le maillage. Utilisez un jeton de fédération Enhanced et, si nécessaire, des identifiants HTTP Basic distincts pour le proxy, en HTTPS/WebSocket. Authentik exige un compte autorisé (existant ou dédié recommandé), un mot de passe d’application et l’authentification par en-tête ; Enhanced ne configure pas le proxy. Le SSO public reste actif. Configurez la liaison séparément sur chaque instance locale.

## Configuration
1. Mettez à jour les deux instances Enhanced. Sur l’instance distante, connectez-vous par SSO comme administrateur. Dans Accueil, choisissez **Créer un jeton de fédération** et copiez-le de manière privée.
2. Dans l’administration du proxy/SSO, utilisez votre compte existant ou, de préférence, un compte dédié autorisé pour cette application, puis générez un mot de passe d’application associé à ce compte (pas votre mot de passe SSO habituel). Avec Authentik, activez **Intercept header authentication** sur le fournisseur proxy et assurez-vous que le reverse proxy transmet l’en-tête Authorization à l’outpost. Cette opération relève de l’administrateur : Enhanced ne modifie pas le proxy.
3. Sur l’instance Enhanced locale, choisissez **Ajouter un agent**, saisissez l’origine HTTPS distante (sans chemin), choisissez **Jeton de fédération** et collez le jeton Enhanced.
4. Activez **Connexion depuis cette instance uniquement**. Renseignez le nom d’utilisateur Authentik du compte choisi et son mot de passe d’application dans les champs HTTP Basic séparés, puis connectez. Laissez-les vides si aucune authentification proxy n’est nécessaire.
5. Répétez sur chaque instance locale devant gérer ce serveur. Aucune connexion retour du serveur distant vers votre LAN privé n’est nécessaire.

## Sécurité et fonctionnement
Les identifiants proxy ouvrent seulement le passage du proxy ; le jeton Enhanced reste obligatoire en mode trusted-proxy. Un simple en-tête endpoint n’authentifie jamais un agent. Le SSO du navigateur ne change pas. La vérification des certificats HTTPS reste active ; l’authentification proxy utilise WebSocket et ne suit pas les redirections. Votre proxy doit accepter les connexions WebSocket. Ce n’est pas une prise en charge automatique de tous les fournisseurs SSO.

Utilisez des comptes administrateurs dédiés et de confiance : un jeton de fédération autorise des actions d’administration. Les jetons utilisent le mécanisme Enhanced existant : désactiver/supprimer leur compte émetteur les invalide ; changer son mot de passe ne suffit pas. Il n’existe pas d’interface de révocation individuelle des jetons. Supprimez la liaison sur l’instance locale pour arrêter sa connexion et révoquez le compte émetteur si son jeton a fuité.

Les identifiants proxy sont enregistrés dans la base locale Enhanced comme les identifiants d’agents existants ; protégez le dossier de données et ses sauvegardes. Ils ne sont ni renvoyés dans la liste des agents ni copiés dans le maillage. Les liaisons à sens unique survivent aux synchronisations du maillage et ne peuvent pas être écrasées par celui-ci. **Réauthentifier** remplace les identifiants ; pour une liaison à sens unique, remplir les deux champs proxy les remplace, laisser les deux vides retire l’authentification proxy. Changer le sens de connexion exige de supprimer puis recréer la liaison.

Une liaison à sens unique appartient seulement à l’instance locale qui l’a créée. Le serveur distant n’obtient pas d’accès administrateur à l’instance locale. Le maillage complet existant reste inchangé. Cela ne crée pas de VPN et ne rend pas les adresses privées joignables ; les transferts et fonctions nécessitant une route retour/directe gardent leurs prérequis réseau.

[Authentik — Header authentication](https://docs.goauthentik.io/add-secure-apps/providers/proxy/header_authentication/)

