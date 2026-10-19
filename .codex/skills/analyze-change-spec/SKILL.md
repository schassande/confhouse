---
name: analyze-change-spec
description: Analyse le fichier de spécification Markdown indiqué dans /doc/changes/ du projet, détermine s'il est suffisamment précis pour l'implémentation, pose les questions manquantes une par une avec un compteur restant, puis met à jour la spec en anglais dans une structure standard et avec sa date de mise à jour.
---

# Analyser et compléter une spécification de changement

## Objectif

Analyser le fichier de spec explicitement indiqué par l'utilisateur dans `/doc/changes/`. Déterminer si ses exigences sont suffisamment précises pour commencer l'implémentation. Si des informations manquent, obtenir les réponses progressivement et les écrire dans la spec.

Ne pas implémenter la fonctionnalité pendant cette analyse, sauf demande explicite distincte.

Decrire l'implementation technique qui doit être réalisé

## Règles impératives

- Proposer des solutions numérotées pour chaque question ; placer la solution recommandée en premier et la marquer `(Recommended)`.
- Permettre une réponse courte par numéro (`1`, `2`, etc.) et accepter une réponse libre si aucune proposition ne convient.

- Lire toute la spec avant de conclure qu'une information manque.
- Ne jamais poser une question dont la réponse figure déjà dans la spec ou dans une réponse précédente.
- Poser une seule question par message et attendre la réponse avant de continuer.
- Afficher le compteur sous la forme `Question X/Y`.
- Mettre à jour la spec avec chaque réponse reçue avant de poser la question suivante.
- Rédiger la spec en anglais, en traduisant le contenu existant si nécessaire.
- Utiliser la structure standard définie ci-dessous, sans supprimer une exigence ou une décision existante.
- Actualiser `Last updated: YYYY-MM-DD` à chaque modification de la spec, avec la date courante.
- Séparer les faits de la spec, les constats issus du code et les décisions prises pendant l'échange.

## Workflow

### 1. Identifier et lire la spec

1. Utiliser le chemin indiqué par l'utilisateur ; s'il est absent, lister les fichiers de `doc/changes/` et demander lequel analyser.
2. Lire le fichier en entier, y compris les notes, TODO et sections incomplètes.
3. Rechercher les éléments déjà documentés avant de préparer toute question : objectifs, règles métier, écrans, données, erreurs, permissions, compatibilité, critères d'acceptation et exclusions.
4. Consulter les documents et sources du dépôt nécessaires pour comprendre le contexte ou vérifier les affirmations, en respectant les `AGENTS.md` applicables.

### 2. Normaliser la spec en anglais

Avant l'analyse finale, reformater la spec dans cette structure standard. Conserver le sens et signaler les passages impossibles à traduire sans décision.

```markdown
# <Feature name>

Last updated: YYYY-MM-DD

## Objective

## Scope

### In scope

### Out of scope

## Functional requirements

## Business rules

## User interface and workflow

## Data model and persistence

## Errors, validation, and permissions

## Compatibility and migration

## Technical specifications

## Acceptance criteria

### List of new tests

## Open decisions

```

Omettre une sous-section vide uniquement si elle est réellement sans objet ; ne pas omettre une section utile simplement parce que la spec actuelle ne la renseigne pas. Dans ce cas, conserver la section et y indiquer `To be clarified`.

Après cette première normalisation, écrire immédiatement la spec dans le fichier avant de poser la première question. Mettre `Last updated` à la date courante, même si la modification ne contient encore aucune réponse utilisateur.

### 3. Évaluer la suffisance

Construire en mémoire une liste complète des informations manquantes ou ambiguës avant de poser la première question. Une question doit être nécessaire pour au moins un des points suivants :

- comportement fonctionnel observable ;
- règle métier ou priorité entre règles ;
- données, types, valeurs par défaut ou persistance ;
- parcours utilisateur, états d'erreur ou permissions ;
- compatibilité, migration ou impact d'une donnée existante ;
- critère permettant de vérifier que l'implémentation est correcte.

Écarter les questions déjà répondues. Regrouper les sous-points qui nécessitent exactement la même décision dans une seule question, mais ne pas regrouper des décisions indépendantes.

Conserver une liste ordonnée des questions restantes. Le total `Y` est le nombre de questions nécessaires après cet inventaire initial. Si une réponse fait apparaître une nouvelle question indispensable, l'ajouter à la fin, expliquer brièvement pourquoi le total a changé, puis utiliser le nouveau total.

### 4. Poser les questions une par une

Pour chaque question, préparer 2 à 4 solutions mutuellement exclusives lorsque le contexte le permet. Décrire chaque solution en une phrase et indiquer brièvement son principal effet ou compromis. Ne pas présenter une solution comme validée par le projet si elle ne l'est pas.

S'il reste des questions :

1. Poser uniquement la première question non résolue.
2. Commencer le message par `Question X/Y`.
3. Formuler la question en français pour faciliter l'échange, tout en mentionnant les termes anglais à inscrire dans la spec si nécessaire.
4. Afficher les solutions sous forme numérotée, par exemple :

   ```text
   1. Option recommandée (Recommended) — ...
   2. ... — ...
   3. ... — ...

   Répondre avec le numéro de l'option choisie, ou préciser une autre réponse.
   ```

5. Ne pas demander de confirmation générale et ne pas poser de question supplémentaire dans le même message.
6. Attendre la réponse de l'utilisateur. Une réponse composée uniquement d'un numéro sélectionne l'option correspondante.

Après chaque réponse :

1. Interpréter la réponse sans inventer de détail.
2. Si la réponse est un numéro, appliquer exactement le texte de l'option choisie ; si elle est libre, clarifier uniquement ce qui reste ambigu.
3. Traduire et intégrer la décision dans la section standard appropriée.
4. Mettre à jour `Last updated` avec la date du jour.
5. Vérifier à nouveau les questions restantes et supprimer toute question devenue inutile.
6. Poser ensuite la prochaine question seule, avec son nouveau compteur et ses propres options numérotées.

### 5. Terminer l'analyse

Lorsque la spec est prête, ne pas afficher de résumé ni de compte rendu d'analyse dans le chat. Répondre uniquement : `La spec est prête. Voulez-vous passer à l'implémentation ?`

Lorsque toutes les informations nécessaires sont présentes :

- écrire la version anglaise normalisée complète dans le fichier ;
- vérifier que `Last updated` est présent et exact ;
- conclure `Ready for implementation` ou `Not ready for implementation` ;
- résumer les impacts techniques vérifiés et les hypothèses restantes ;
- fournir les critères d'acceptation et les vérifications recommandées.
- Ecrire la specification technique de l'implementation

Ne pas demander une validation supplémentaire si aucune décision nécessaire ne manque. Si une décision facultative reste ouverte mais ne bloque pas l'implémentation, la placer dans `Open decisions` et marquer la spec comme prête sous réserve, en expliquant pourquoi.

## Analyse des impacts

Inspecter, lorsque pertinent :

- `persistent-data-model/` et les données persistées ;
- `frontend/` : écrans, composants, services et parcours ;
- `functions/` : fonctions, contrats HTTP et logique backend ;
- règles et index Firestore ;
- tests, configuration et documentation dans `doc/`.

Citer les chemins, symboles, routes ou champs qui justifient chaque impact. Distinguer les faits observés des déductions et des recommandations. Vérifier explicitement si la documentation existante reste exacte.

## Compte rendu final

Utiliser ce format uniquement pour structurer les informations conservées dans la spec ; ne pas l'afficher dans le chat lorsque l'analyse est terminée :

```markdown
# Spec analysis: <file>

## Readiness
Ready for implementation | Not ready for implementation

## Summary
...

## Verified impacts
| Area | Evidence | Expected impact |
|---|---|---|
| ... | ... | ... |

## Remaining assumptions
- ...

## Recommended implementation breakdown
1. ...

## Recommended checks
- ...
```

Si des questions restent à poser, ne produire que la question courante et le compteur ; ne pas révéler toutes les questions restantes dans le message.
