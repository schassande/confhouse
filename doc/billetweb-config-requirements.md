# BilletWeb - Specification fonctionnelle reformulee

## Objectif
Ajouter une integration BilletWeb pour gerer les places attribuees aux speakers, organisateurs et sponsors.

## Portee de cette etape
Creer une page de configuration `BilletWebConfig` permettant de parametrer l'acces API BilletWeb et d'associer l'evenement et les tarifs utiles a la conference.

## Acces et navigation
- La page est accessible depuis le menu **Configuration** de `conference-manager`.
- L'acces est reserve aux organisateurs via Guard.

## Donnees persistees
- `BilletWebConfig` contient :
  - `apiUrl`
  - `userId`
  - `keyVersion`
  - `eventId`
  - `ticketTypes.speaker`
  - `ticketTypes.organizer`
  - `ticketTypes.sponsors` comme tableau obligatoire de `BilletwebTicketType`
  - `customFieldMappings` comme tableau optionnel de `ActivityTicketFieldMapping`
- La cle API (`key`) est stockee dans un `ConferenceSecret` dedie.

## UI attendue
- Formulaire PrimeNG avec internationalisation.
- Stepper PrimeNG en 4 etapes.
- Boutons `Previous` / `Next`, puis `Cancel` / `Save`.

## Etape 1 - Connection BilletWeb
Champs a editer :
- `apiUrl`
- `userId`
- `keyVersion`
- `key`

Fonction de test :
- Le bouton `Tester` charge les evenements BilletWeb.
- L'UI affiche le nombre d'evenements trouves.

Regle de passage :
- L'etape 2 est accessible seulement si les 4 champs sont renseignes.

## Etape 2 - Choix de l'evenement
- Charger et afficher la liste des evenements BilletWeb.
- L'utilisateur selectionne l'evenement correspondant a la conference.
- Sauvegarder l'identifiant selectionne dans `BilletWebConfig.eventId`.

## Etape 3 - Les types de ticket
Precondition :
- `eventId` doit etre defini.

Chargement des tarifs :
- `GET https://<apiUrl>/event/<eventId>/tickets?user=<userId>&key=<secret key>&version=<keyVersion>`

Interface :
- 2 selecteurs simples :
  - `speaker`
  - `organizer`
- 1 multiselect PrimeNG obligatoire :
  - `sponsors`

Regles metier :
- La liste `ticketTypes.sponsors` alimente les quotas de billets dans la configuration sponsor.
- Un type de ticket sponsor deja utilise dans un niveau de sponsor ne peut pas etre deselectionne.

Persistance :
- `speaker` et `organizer` stockent un `ticketTypeId` et un `ticketTypeName`.
- `sponsors` stocke un tableau de `ticketTypeId` et `ticketTypeName`.

## Etape 4 - Les custom fields
Chargement des activites :
- Les activites de la conference sont chargees une seule fois via `ActivityService.byConferenceId(conferenceId)`.

Interface :
- L'utilisateur peut ajouter, modifier et supprimer des lignes de mapping.
- Chaque ligne permet de choisir :
  - une activite de la conference (`activityId`)
  - un attribut parmi les `specificAttributes` de cette activite (`activityAttributeName`)
  - un identifiant de custom field BilletWeb (`billetwebCustomFieldId`)

Regles de saisie :
- La liste des activites vient uniquement de la conference courante.
- La liste des attributs depend de l'activite selectionnee.
- `billetwebCustomFieldId` est un texte court limite a 10 caracteres.

## Contrainte technique CORS
- Aucun appel direct navigateur -> BilletWeb.
- Les appels BilletWeb passent obligatoirement par une fonction serveur (proxy).
