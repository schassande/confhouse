# Objectif
L'objectif de l'évolution à implémenter est de permettre la gestion des billets pour un sponsor en fonction de ce qui est inclus dans le type de sponsor qu'il a choisi. Cette gestion consiste à interagir avec l'application web BilletWeb pour créer, modifier ou supprimer les billets.

# Spécifications

## La page sponsor-edit
Dans la page sponsor-edit, onglet billets, un organisateur doit voir la liste des billets alloués pour le sponsor dans le cadre du sponsoring. Selon le type de sponsor, il a droit à un certain nombre de billets et de différents types : les quotas sont définis dans `SponsorType`. La liste affiche sous forme d'une DataView PrimeNG un bloc par billet.

La DataView doit lister tous les `Sponsor.participantTicketIds`. S'il n'y a pas le bon nombre au départ, il faut créer ceux manquants. Ainsi la liste contient toujours le nombre de billets possible pour ce sponsor. Il n'y a pas de fonction add/delete.

## Le bloc d'un billet
Le bloc d'un billet affiche les informations de l'objet `ParticipantBilletWebTicket` sous la forme d'un formulaire avec les éléments suivants :
- Type de billet : il est non modifiable car il est déterminé par le type de sponsor.
- Nom du participant : champ texte éditable.
- Prénom du participant : champ texte éditable.
- Email du participant : champ email éditable.
- Custom fields : pour chaque custom field :
  - le label est le nom de l'attribut dans l'activité ;
  - l'input de saisie se base sur le type de l'attribut ;
  - la valeur est récupérée depuis la valeur de `ActivityParticipation` ;
  - pour récupérer le `ActivityParticipation`, il faut d'abord chercher la personne par l'email.
- Status : il est non modifiable car il reflète l'état courant du billet. Il doit se mettre à jour lors des actions.
- N° du ticket BilletWeb interne : valeur texte non modifiable mais mise à jour lors des actions.
- N° du ticket BilletWeb externe : valeur texte non modifiable mais mise à jour lors des actions.
- Lien de téléchargement du billet : valeur texte non modifiable mais mise à jour lors des actions. Il est cliquable.
- Lien de gestion du billet : valeur texte non modifiable mais mise à jour lors des actions. Il est cliquable.
- Bouton "Créer billet" : quand le billet n'a jamais été créé dans BilletWeb (`ParticipantBilletWebTicket.ticketStatus == NON_EXISTING`), le bouton a pour label "Créer le billet", sinon "Mettre à jour le billet". Le bouton est activé seulement si nom, prénom et email sont définis. Un clic sur le bouton déclenche :
  1. la recherche de la personne par l'email ; si elle n'existe pas, il faut créer la personne avec prénom, nom, email ; le champ `personId` est mis à jour avec la personne trouvée ;
  2. pour chaque champ custom, créer ou mettre à jour un `ActivityParticipation` de la personne pour l'activité ;
  3. créer ou modifier le billet dans BilletWeb selon le statut `ticketStatus`. Les attributs de `ParticipantBilletWebTicket` sont remplis avec la réponse de BilletWeb.
- Bouton Supprimer : ce bouton est activé seulement si le statut `ParticipantBilletWebTicket.ticketStatus` est `CREATED`. Le clic sur le bouton déclenche :
  1. la suppression du billet dans BilletWeb ;
  2. le passage du statut `ParticipantBilletWebTicket.ticketStatus` à `DELETED` ;
  3. le vidage de tous les attributs de `ParticipantBilletWebTicket` sauf `conferenceId`, `personId` et `ticketName`.

# API BilletWeb
Les appels à l'API BilletWeb doivent être opérés par une fonction serveur uniquement.
L'API de BilletWeb est décrite ici : https://www.billetweb.fr/bo/api.php#/api

Les valeurs de `user`, `version` et `key` sont définies dans la configuration BilletWeb pour la conférence (`BilletwebConfig`).

## Création d'un billet sur BilletWeb
Inspire-toi du script `/tmp-billetweb-add-order-test.sh` qui montre comment créer un billet.
L'appel à la fonction de création d'un billet produit le résultat de ce type :
```json
[
  {
    "id": "116916507",
    "request_id": "order-1774520612",
    "products": [
      "281504827"
    ],
    "products_eq": {
      "product-1774520612": "281504827"
    },
    "products_details": [
      {
        "id": "281504827",
        "ext_id": "T985-1829-E1397785",
        "request_id": "product-1774520612",
        "product_download": "https://www.billetweb.fr/download.php?product=T985-1829-E1397785&key=584c8395a39173e970d19a375c3308bc"
      }
    ]
  }
]
```

Il manque donc des informations pour compléter l'objet `ParticipantBilletWebTicket`.
Pour cela il faut faire une requête supplémentaire `/attendees` qui donne ce type de résultat :
```json
[
  {
    "id": "281504827",
    "ext_id": "T985-1829-E1397785",
    "barcode": "8178363530",
    "used": "0",
    "lane": "",
    "used_date": "0000-00-00 00:00:00",
    "email": "sebastien.chassande-barrioz@cgi.com",
    "firstname": "Sebastien",
    "name": "Chassande",
    "ticket": "Sponsor conference",
    "category": "",
    "ticket_id": "6912365",
    "price": "0.00",
    "seating_location": "",
    "last_update": "2026-03-26 11:23:32",
    "reduction_code": "",
    "authorization_code": "",
    "pass": "0",
    "disabled": "0",
    "product_management": "https://www.billetweb.fr/my_order.php?product=T985-1829-E1397785&key=584c8395a39173e970d19a375c3308bc",
    "product_download": "https://www.billetweb.fr/download.php?product=T985-1829-E1397785&key=584c8395a39173e970d19a375c3308bc",
    "order_id": "116916507",
    "order_ext_id": "C624-1084-E1397785",
    "order_firstname": "Sebastien",
    "order_name": "Chassande",
    "order_email": "sebastien.chassande-barrioz@cgi.com",
    "order_date": "2026-03-26 11:23:32",
    "order_paid": "1",
    "order_payment_type": "other",
    "order_payment_date": "2026-03-26 11:23:32",
    "order_origin": "",
    "order_price": "0.00",
    "order_session": "0",
    "session_start": "",
    "order_accreditation": "0",
    "order_management": "https://www.billetweb.fr/my_order.php?order=C624-1084-E1397785&key=05de823365cd3725ed4bd558296d9fe8",
    "order_language": "fr",
    "custom": {
      "Repas": "Normal"
    }
  }
]
```

Il faut donc chercher dans le résultat le bon billet par son `id`.

## Modifier un billet
Il faut utiliser `update_product` de l'API : https://www.billetweb.fr/bo/api.php#/api/event/:id/update_product
Pour la mise à jour il n'est pas nécessaire de rappeler la fonction de liste des participants de la conférence car je pense que nous avons déjà tous les champs bien remplis dans `ParticipantBilletWebTicket`.

## Supprimer un billet
Il faut utiliser la fonction `delete_order` : https://www.billetweb.fr/bo/api.php#/api/event/:id/delete_order

# Consignes
Dans le modèle j'ai déjà :
- créé l'objet persistant `ParticipantBilletWebTicket`. Il faudra créer le service Angular.
- modifié l'objet `Sponsor` pour remplacer l'ancien attribut des tickets par une liste d'id (`string[]`) de `ParticipantBilletWebTicket`.
- l'affichage actuel des listes de tickets doit être nettoyé.
- faire un plan d'action que tu écris dans ce document WIP. Tu le mets à jour à chaque étape afin que je puisse arrêter au milieu. Présente-moi ton plan au début et demande-moi un GO à chaque étape.
- pose-moi des questions dès que le choix technique ou fonctionnel n'est pas trivial. Note les réponses dans ce document.

# Plan d'action

## Étape 1 - Cadrage et alignement du modèle
- [COMPLETED] Recenser les usages de l'ancien modèle `conferenceTickets` et les points d'intégration BilletWeb / Person / ActivityParticipation.
- [COMPLETED] Stabiliser la conception sans modifier `ParticipantBilletWebTicket`.

## Étape 2 - Backend BilletWeb et persistance
- [COMPLETED] Ajouter la persistance et les helpers serveur autour de `ParticipantBilletWebTicket`.
- [COMPLETED] Exposer des endpoints organisateur pour synchroniser les billets attendus d'un sponsor avec ses quotas.
- [COMPLETED] Exposer des endpoints organisateur pour créer / mettre à jour / supprimer un billet BilletWeb via les fonctions serveur uniquement.

## Étape 3 - Frontend sponsor-edit
- [COMPLETED] Créer le service Angular `ParticipantBilletWebTicketService`.
- [COMPLETED] Remplacer l'ancien onglet billets de `sponsor-edit` par une DataView pilotée par `participantTicketIds`.
- [COMPLETED] Gérer un view-model d'édition enrichi en mémoire avec `Person` et `ActivityParticipation`, sans persister ces champs dans `ParticipantBilletWebTicket`.

## Étape 4 - Nettoyage, documentation et validation
- [PENDING] Nettoyer les usages restants de l'ancien modèle dans les écrans et services concernés.
- [PENDING] Mettre à jour la documentation dans `/doc` et vérifier qu'elle reste cohérente.
- [PENDING] Exécuter les vérifications utiles (build/tests ciblés) et consigner le résultat.

# Questions / réponses

## Questions ouvertes
- Aucune question bloquante à ce stade.

## Réponses validées
- 2026-03-27 : ne pas modifier le modèle `ParticipantBilletWebTicket` pour y dupliquer le nom, le prénom ou l'email. Ces informations doivent être retrouvées via `Person` à partir de `personId`.
- 2026-03-27 : si un besoin semble imposer une modification du modèle persistant, il faut d'abord demander validation avant tout changement.
- 2026-03-27 : en cas de surplus par rapport au quota attendu, conserver les tickets en trop et ne jamais en supprimer automatiquement.
- 2026-03-27 : conserver la synchronisation structurelle des `ParticipantBilletWebTicket` côté fonction serveur. Cette fonction sera appelée par le frontend organisateur pour synchroniser les billets attendus avec le quota, typiquement à l'ouverture de l'onglet billets et après un changement de type sponsor.
- 2026-03-27 : l'onglet billets doit être entièrement désactivé tant que le sponsor n'est pas `CONFIRMED`.
- 2026-03-27 : le `sponsorTypeId` reste modifiable tant que le sponsor n'est pas `CONFIRMED`, puis devient non modifiable dans l'écran organisateur.
- 2026-03-27 : les custom fields du billet restent toujours éditables dans le view-model frontend, même sans `personId`. Leur persistance réelle se fait lors de l'action serveur créer / mettre à jour le billet, après résolution ou création de la `Person`.

## Notes d'implémentation
- 2026-03-27 : le backend conserve le nom de l'endpoint `allocateSponsorTickets`, mais son comportement devient une synchronisation des `participantTicketIds` avec les quotas sponsor.
- 2026-03-27 : en cas de changement de type sponsor, les tickets déjà `CREATED` ne voient pas leur `ticketName` réécrit automatiquement afin d'éviter une modification implicite d'un billet déjà créé côté BilletWeb. Les tickets non créés peuvent être réalignés au quota courant.
- 2026-03-27 : le build TypeScript des fonctions passe. Les payloads exacts `update_product` et `delete_order` restent à valider contre BilletWeb en test réel.
- 2026-03-27 : choix d'architecture explicite : la fonction serveur de synchronisation ne contacte pas BilletWeb. Elle gère uniquement la structure des documents `ParticipantBilletWebTicket` et de `Sponsor.participantTicketIds`. Les appels BilletWeb restent limités aux actions créer / mettre à jour / supprimer un billet.
- 2026-03-27 : côté frontend organisateur, les cartes de billets affichent nom, prénom, email et custom fields dans un view-model local. `personId` reste la seule référence persistée vers `Person` dans `ParticipantBilletWebTicket`.
- 2026-03-27 : le frontend Angular compile après le remplacement de l'ancien modèle `conferenceTickets` dans `sponsor-edit`, `sponsor.service` et l'onglet billets du sponsor self-service.
- 2026-03-28 : un nouveau bouton organisateur "Envoyer par email" est ajouté sur chaque billet sponsor `CREATED`. Il appelle une nouvelle fonction serveur `sendSponsorParticipantTicket`, qui utilise l'endpoint BilletWeb `update_order` pour demander le renvoi de l'email du billet à `orderEmail`.
- 2026-03-28 : l'appel exact à BilletWeb pour `update_order` est implémenté avec le payload `{ id: orderId, email: orderEmail, notify: 1 }`. C'est une hypothèse de travail cohérente avec la documentation disponible, à valider contre BilletWeb en test réel.
