# Notification gestionnaire lors d'une inscription sponsor

## Role du fichier WIP

Pendant l'implementation, ce fichier sert de statut d'avancement pour cette evolution.

A chaque etape realisee, le fichier doit etre mis a jour pour indiquer la nouvelle etape terminee, les decisions confirmees et les points restants.

Lorsque l'implementation sera terminee, le contenu utile de ce fichier devra etre deplace dans un fichier dedie sous `/doc/changes` pour conserver la trace de l'evolution. Le fichier `/doc/WIP.md` pourra ensuite etre nettoye ou reutilise pour le prochain chantier.

## Objectif

Envoyer une notification interne au gestionnaire sponsors lorsqu'une nouvelle candidature sponsor est creee.

Cette notification est independante des emails envoyes au sponsor. Elle ne remplace pas l'email de confirmation de candidature et ne doit pas modifier le parcours utilisateur sponsor.

## Decisions de conception

- Le declencheur est la creation d'un nouveau document `Sponsor` dans Firestore.
- La notification est envoyee uniquement lors de la creation initiale du sponsor.
- Les mises a jour ulterieures d'une candidature sponsor ne declenchent pas cette notification.
- L'envoi est asynchrone et ne bloque pas la creation du sponsor.
- Un echec Mailjet ne doit pas produire d'erreur visible pour le sponsor et ne doit pas annuler l'inscription.
- La notification n'est pas historisee dans `Sponsor.businessEvents`.
- Aucun mecanisme d'idempotence applicatif supplementaire n'est requis au-dela du declencheur Firestore `onCreate`.
- Le contenu de l'email est porte par un template Mailjet, comme les autres emails sponsor.
- Le template Mailjet contient les versions FR et EN du message.
- La notification n'est pas liee au flux d'email `SPONSOR_APPLICATION_CONFIRMATION`.

## Destinataire

Le destinataire est l'email sponsor configure pour la conference.

Decision a implementer dans le modele :

- reutiliser `Conference.sponsoring.email` comme destinataire gestionnaire de la notification interne
- ne pas reutiliser `Conference.sponsoring.ccEmail`, qui sert deja de copie globale des communications sponsor

Si `Conference.sponsoring.email` est absent ou vide, la fonction asynchrone doit journaliser l'absence de destinataire et terminer sans erreur.

## Template Mailjet

Ajouter un nouveau type de template sponsor :

```ts
interface SponsorTypeTemplateEmail {
  emailManagerNotificationTemplateId?: string;
}
```

Le template est resolu depuis le `SponsorType` correspondant a `Sponsor.sponsorTypeId` dans `Conference.sponsoring.sponsorTypes[]`.

Si aucun template n'est configure pour le niveau sponsor, la fonction doit journaliser l'absence de template et terminer sans erreur. Aucun fallback texte serveur n'est requis pour cette notification interne.

## Donnees envoyees au template

La fonction doit fournir au minimum les variables suivantes au template Mailjet :

- `conferenceName`
- `conferenceEdition`
- `sponsorId`
- `sponsorName`
- `sponsorTypeId`
- `sponsorTypeName`
- `submissionDate`
- `sponsorAdminUrl`

`submissionDate` doit utiliser `Sponsor.registrationDate` si disponible, sinon la date de creation disponible dans le contexte Firestore ou l'heure courante de traitement.

`sponsorAdminUrl` doit pointer vers la fiche sponsor dans l'interface d'administration. L'implementation devra s'appuyer sur le meme mecanisme de configuration d'URL applicative que les autres liens generes par le backend, ou introduire une configuration explicite si aucun mecanisme existant ne convient.

Decision : l'URL publique de l'administration est fournie au backend par une variable d'environnement `ADMIN_BASE_URL`.

La fonction doit construire `sponsorAdminUrl` a partir de cette base et du chemin de la fiche sponsor. L'implementation doit normaliser le slash final de `ADMIN_BASE_URL` pour eviter les URLs mal formees.

Si `ADMIN_BASE_URL` est absent ou vide, la fonction doit journaliser l'erreur de configuration et terminer sans envoyer la notification.

## Comportement fonctionnel

Flux cible :

1. Un sponsor soumet une nouvelle candidature.
2. L'application cree un document dans la collection `sponsor`.
3. Une Cloud Function Firestore `onCreate` est declenchee.
4. La fonction lit le sponsor cree.
5. La fonction lit la conference liee via `Sponsor.conferenceId`.
6. La fonction resout le niveau sponsor via `Sponsor.sponsorTypeId`.
7. La fonction verifie `Conference.sponsoring.email`.
8. La fonction verifie `SponsorType.templateEmail.emailManagerNotificationTemplateId`.
9. La fonction envoie l'email via Mailjet avec les variables du template.
10. La fonction journalise le resultat technique.

Les erreurs de lecture, configuration ou envoi doivent etre logguees avec le contexte utile (`conferenceId`, `sponsorId`, cause), sans exposer de secret ni bloquer le flux sponsor.

## Impacts techniques prevus

- `shared/src/model/sponsor.model.ts`
  - ajouter `emailManagerNotificationTemplateId?: string` dans `SponsorTypeTemplateEmail`
  - documenter que ce template sert a notifier le gestionnaire lors d'une creation sponsor

- `functions`
  - ajouter une Cloud Function Firestore declenchee a la creation d'un `Sponsor`
  - implementer le point d'entree dans `functions/src/sponsor/communication/notify-manager-on-sponsor-create.ts`
  - exporter la fonction depuis `functions/src/index.ts`
  - placer la logique reusable de resolution conference/sponsor type, variables Mailjet et envoi dans un module dedie sous `functions/src/sponsor/communication/` si le point d'entree devient non trivial
  - reutiliser `functions/src/mail/mailjet-service.ts` pour l'envoi, `functions/src/mail/mailjet-secrets.ts` pour les secrets Mailjet, et les contrats de `functions/src/mail/mail-model.ts` pour construire le `TransactionalEmailPayload`
  - ne pas appeler directement l'API Mailjet depuis la nouvelle fonction
  - lire `ADMIN_BASE_URL` depuis l'environnement serveur pour construire `sponsorAdminUrl`
  - garder l'envoi non bloquant pour l'utilisateur final
  - ne pas creer de `SponsorBusinessEvent`

- `doc/sponsor.md`
  - documenter la notification interne de creation sponsor
  - documenter que `Conference.sponsoring.email` sert aussi de destinataire de cette notification interne
  - documenter le nouveau template `emailManagerNotificationTemplateId`

- `doc/datamodel.md`
  - documenter le nouveau champ de template et le role de `Conference.sponsoring.email` pour cette notification

- `doc/mailjet.md`
  - documenter le nouveau type de template sponsor et ses variables

- `doc/dev.md`
  - documenter la variable serveur `ADMIN_BASE_URL` dans le chapitre `Production configuration`
  - inclure, comme pour les autres variables, les exemples de lignes de commande permettant de la definir en production
