# Guide de Test - Fonction `createPerson`

## Résumé

La fonction `createPerson` crée une personne dans Firestore en garantissant l'unicité de l'email via une collection d'index `person_emails`.

### Caractéristiques
- **Type**: HTTP Cloud Function (POST)
- **Endpoint**: `POST /{PROJECT_ID}/{REGION}/createPerson`
- **Port émulateur**: 5001
- **Région**: us-central1

### Validations
- ✓ Vérification email unique via transaction Firestore
- ✓ Retour 409 si email existe déjà
- ✓ Retour 201 avec person complète (id, lastUpdated)
- ✓ Validation du corps de la requête
- ✓ Gestion des erreurs avec codes d'erreur

---

## Construction

Depuis le répertoire racine du projet:

```powershell
cd functions
npm run build
```

Fichiers générés:
- `functions/lib/index.js` - Code compilé
- `functions/lib/index.js.map` - Source map

---

## Démarrage de l'Émulateur

### Prérequis
- Firebase CLI v15+ installé
- Node.js 24+
- npm packages: `npm install` dans le répertoire racine

### Étape 1: Configuration Firebase
Assurez-vous que les fichiers suivants existent et sont correctement configurés:
- `.firebaserc` - Contient l'identifiant du projet
- `firebase.json` - Configuration des émulateurs (ports, fonctions, etc.)

### Étape 2: Lancer les Émulateurs
```powershell
cd c:\data\perso\snowcamp\cfp-manager
firebase emulators:start --only functions,firestore
```

Expected output:
```
i  emulators: Starting emulators: functions, firestore
i  functions: Listening for HTTP requests at http://localhost:5001
i  firestore: Listening on 127.0.0.1:8080
```

---

## Tests

### Test 1: Créer une nouvelle personne (201 - Success)
```powershell
$person = @{
    firstName = "Jean"
    lastName = "Dupont"
    email = "jean.dupont@example.com"
    hasAccount = $false
    preferredLanguage = "fr"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:5001/conference-manager-007/us-central1/createPerson" `
    -Method POST `
    -Body $person `
    -ContentType "application/json"
```

**Réponse attendue (201):**
```json
{
  "person": {
    "id": "abc123def456",
    "firstName": "Jean",
    "lastName": "Dupont",
    "email": "jean.dupont@example.com",
    "hasAccount": false,
    "preferredLanguage": "fr",
    "lastUpdated": "1704067200000"
  }
}
```

### Test 2: Créer avec email existant (409 - Conflict)
Exécutez la même requête deux fois avec le même email.

**Réponse attendue (409):**
```json
{
  "error": "Email already exists",
  "code": "EMAIL_EXISTS"
}
```

### Test 3: Email manquant (400 - Bad Request)
```powershell
$invalidPerson = @{
    firstName = "Test"
    lastName = "User"
    hasAccount = $false
    preferredLanguage = "en"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:5001/conference-manager-007/us-central1/createPerson" `
    -Method POST `
    -Body $invalidPerson `
    -ContentType "application/json"
```

**Réponse attendue (400):**
```json
{
  "error": "Missing person or email in request body"
}
```

### Test 4: Méthode non autorisée (405)
```powershell
Invoke-WebRequest -Uri "http://localhost:5001/conference-manager-007/us-central1/createPerson" `
    -Method GET
```

**Réponse attendue (405):**
```json
{
  "error": "Method Not Allowed, use POST"
}
```

### Test 5: Script de test automatisé
```powershell
.\test-createperson.ps1
```

---

## Vérification dans Firestore

### Via l'Émulateur Web
Une fois les émulateurs lancés, vérifiez les données via:
1. Collections `person` - Documents créés
2. Collections `person_emails` - Index d'unicité email

### Commande Firebase CLI
```powershell
firebase firestore:inspect
```

---

## Déploiement en Production

Après validation locale:

```powershell
firebase deploy --only functions:createPerson
```

Le projet ID (conference-manager-007) doit être valide et actif dans Firebase Console.

---

## Dépannage

### Les émulateurs ne démarrent pas
- Vérifiez que `firebase.json` contient la section `emulators`
- Vérifiez que `.firebaserc` pointe vers un projet valide
- Les ports 5001 et 8080 doivent être libres

### Erreur: "Project not found"
- Vérifiez le PROJECT_ID dans les tests
- Vérifiez `.firebaserc`

### Erreur de transaction Firestore
- Assurez-vous que Firestore Emulator tourne aussi: `firebase emulators:start --only functions,firestore`

---

## Structure des Données

### Collection `person` Document
```json
{
  "id": "auto-generated-id",
  "firstName": "string",
  "lastName": "string",
  "email": "string (unique via person_emails index)",
  "hasAccount": "boolean",
  "preferredLanguage": "string (en|fr|...)",
  "speaker": {
    "company": "string",
    "bio": "string",
    "reference": "string",
    "photoUrl": "string",
    "socialLinks": [
      {
        "network": "string",
        "url": "string"
      }
    ]
  },
  "lastUpdated": "string (timestamp)"
}
```

### Collection `person_emails` Document (Index)
```json
{
  "personId": "reference to person doc",
  "email": "lowercased email",
  "createdAt": "server timestamp"
}
```

Document ID = lowercased email (garantit l'unicité)

---

## Notes pour le Développement

- La fonction utilise `admin.firestore.FieldValue.serverTimestamp()` pour `createdAt` dans l'index
- L'email est normalisé (trim + lowercase) avant stockage
- Chaque personne recevra un `id` auto-généré par Firestore
- `lastUpdated` est défini à la création

