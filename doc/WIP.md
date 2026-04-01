# Auto gestion des billets par les sponsors

# Objectif
Nous allons maintenant permettre à un sponsor de gérer ses billets. Il faut qu'il puisse faire les memes fonctionnalités qu'un organisateur mais seulement sur ses billets.

## Consignes

- Prépares un plan que je puisse le valider
- Poses les questions pour TOUS les choix fonctionnels ou techniques


## Questions à valider avant implémentation

1. Le sponsor doit-il avoir exactement les mêmes actions que l’organisateur sur ses billets, donc create/update, delete et send/resend ? 
=> OUI

2. Souhaitez-vous que le sponsor puisse aussi déclencher la synchronisation des slots/quota, ou bien qu’elle reste implicite au chargement de la page seulement ? 
=> Ne pas déclencher la synchronisation. Seul l'organisateur peut déclencher la synchronisation donc la création des PARTICIPANT_BILLETWEB_TICKET. Lorsque les objets ne sont pas créés l'affichage indique que la configuration des billets n'est pas encore accessible.

3. Confirmez-vous que l’écran cible est bien l’onglet “Conference tickets” de sponsor-application.component.html, et pas une nouvelle page dédiée ?
=> oui c'est bien dans la page sponsor-application, dans l'onglet "Billet" existant

4. Pour l’autorisation backend, validez-vous l’option recommandée suivante : permettre organisateur OU sponsor admin sur les endpoints ticket existants, plutôt que créer une deuxième famille d’endpoints quasi identiques ?
=> oui extension des droits pour les sponsor admin

5. Le sponsor doit-il pouvoir modifier les champs participant et custom fields même hors période de sponsoring, dès lors que le sponsor est CONFIRMED, ou faut-il conserver la contrainte de période déjà appliquée au self-service sponsor ?
=> La modification des champs doit être permise dès que les objets PARTICIPANT_BILLETWEB_TICKET sont créées par l'organisateur et jusqu'à une certaine date limite. Cette date limite doit etre définie par un nouvel attribut Conference.sponsoring.ticketEndDate. Cette date doit être configurable dans la page sponsor-config, onglet campagne : ajouter un nouveau bloc à la suite de "Periode d'enregistrement du sponsoring". Ce nouveau bloc permet de définir "la date limite d'enregistrement des billets". 

