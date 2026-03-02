# BilletWeb - Spécification fonctionnelle reformulée

## Objectif
Ajouter une intégration BilletWeb pour gérer les places attribuées aux speakers, organisateurs et sponsors.

## Portée de cette première étape
Créer une page de configuration `BilletWebConfig` permettant de paramétrer l’accès API BilletWeb et d’associer l’événement/tarifs utiles à la conférence.

## Accès et navigation
- La page est accessible via une nouvelle entrée dans le menu **Configuration** de `conference-manager`.
- L’accès est limité aux organisateurs via Guard.

## Données persistées
- `BilletWebConfig` (document principal) contient :
  - `apiUrl`
  - `userId`
  - `keyVersion`
  - `eventId`
  - Les 4 rôles de ticket avec `ticketTypeId` + `ticketTypeName` :
    - speaker
    - organizer
    - sponsorConference
    - sponsorStand
- La clé API (`key`) est stockée dans un `ConferenceSecret` dédié.

## UI attendue
- Formulaire PrimeNG avec internationalisation.
- Stepper PrimeNG en 3 étapes.
- Boutons `Previous` / `Next` selon les droits de navigation.
- Boutons `Cancel` et `Save`.

## Étape 1 - Connection BilletWeb
Champs à éditer :
- `apiUrl`
- `userId`
- `keyVersion`
- `key` (secret)

Fonction de test :
- Bouton `Tester` qui appelle la récupération des événements.
- Affichage du nombre de conférences trouvées.

API utilisée pour le test :
- `GET https://<apiUrl>/events?user=<userId>&key=<secret key>&version=<keyVersion>&past=1`

Règle de passage :
- Passage à l’étape 2 autorisé seulement si les 4 champs sont renseignés.
- Le test n’est pas obligatoire.

## Étape 2 - Choix de l’événement
- Charger et afficher la liste des événements BilletWeb.
- L’utilisateur sélectionne l’événement correspondant à la conférence.
- Sauvegarder l’identifiant sélectionné dans `BilletWebConfig.eventId`.

API utilisée :
- `GET https://<apiUrl>/events?user=<userId>&key=<secret key>&version=<keyVersion>&past=1`

Règle de passage :
- Passage à l’étape 3 autorisé uniquement si un événement est sélectionné.

## Étape 3 - Les types de ticket
Précondition :
- `eventId` doit être défini.

Chargement des tarifs :
- `GET https://<apiUrl>/event/<eventId>/tickets?user=<userId>&key=<secret key>&version=<keyVersion>`

Interface :
- 4 sélecteurs de tarif :
  - speaker
  - organizer
  - sponsorConference
  - sponsorStand

Persistance :
- Pour chaque rôle, stocker `ticketTypeId` et `ticketTypeName`.

## Contrainte technique CORS
- Aucun appel direct navigateur -> BilletWeb.
- Les appels BilletWeb passent obligatoirement par une fonction serveur (proxy).
