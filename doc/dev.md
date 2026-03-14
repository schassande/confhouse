# Development documentation

## Local development

### Backend (Cloud Functions)
1. Install dependencies:
   ```sh
   cd functions
   npm install
   ```
2. To emulate locally:
   ```sh
   firebase emulators:start
   ```

### Mailjet configuration

The Mailjet integration uses a hybrid credential strategy:

- in deployed environments, credentials must come from Firebase Functions secrets
- in local development or emulator mode, credentials can come from environment variables

#### Local / emulator configuration

For local development, define these environment variables before starting the Functions emulator:

- `MAILJET_API_KEY`
- `MAILJET_SECRET_KEY`

PowerShell example:

```powershell
$env:MAILJET_API_KEY="your_mailjet_api_key"
$env:MAILJET_SECRET_KEY="your_mailjet_secret_key"
firebase emulators:start --only functions,firestore,storage
```

Bash example:

```bash
export MAILJET_API_KEY="your_mailjet_api_key"
export MAILJET_SECRET_KEY="your_mailjet_secret_key"
firebase emulators:start --only functions,firestore,storage
```

If these variables are missing locally, Mailjet-based sponsor actions will fail explicitly.

#### Production configuration

In production, the same values must be configured as Firebase Functions secrets with these exact names:

- `MAILJET_API_KEY`
- `MAILJET_SECRET_KEY`

Commands:

```sh
firebase functions:secrets:set MAILJET_API_KEY
firebase functions:secrets:set MAILJET_SECRET_KEY
```

After setting or rotating the secrets, redeploy the Functions:

```sh
cd functions
npm run build
cd ..
firebase deploy --only functions
```

Notes:

- deployed Mailjet functions do not rely on plain environment variables
- local environment variables are only intended for local development and emulator usage
- never commit Mailjet credentials to the repository

### Firebase Storage (local)
Storage is now configured locally with:
- `storage.rules` for Storage security rules
- `firebase.json` with the `storage` section and the Storage emulator (`port: 9199`)

To start emulators including Storage:
```sh
firebase emulators:start --only functions,firestore,storage
```

To start only Storage:
```sh
firebase emulators:start --only storage
```

### Frontend (Angular)
1. Install dependencies:
   ```sh
   cd frontend
   npm install
   ```
   ```
2. Create `src/environments/environment.ts` and `src/environments/environment.prod.ts` with this template:
   ```ts
   export const environment = {
     production: false, // true in environment.prod.ts
     firebase: {
       apiKey: "YOUR_API_KEY",
       authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
       projectId: "YOUR_PROJECT_ID",
       storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
       messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
       appId: "YOUR_APP_ID",
       function_region: "us-central1"
     }
   };
   ```
   Don't add this file on Git project. There are ignored for security reasons.
3. Start the dev server:
   ```sh
   npm start
   ```

## Deployment

1. Build the frontend:
   ```sh
   cd frontend
   ng build --configuration production
   ```
2. Deploy functions, hosting, Firestore rules/indexes and Storage rules:
   ```sh
   firebase deploy
   ```
   Before deploying Mailjet-enabled sponsor actions, make sure the `MAILJET_API_KEY` and `MAILJET_SECRET_KEY` Firebase secrets are configured.
3. Deploy only Storage rules (optional):
   ```sh
   firebase deploy --only storage
   ```
4. Deploy only the Voxxrin generation function (optional):
   ```sh
   firebase deploy --only functions:generateVoxxrinEventDescriptor
   ```

## Hosting access

### Snowcamp
- [https://conference-manager-007.web.app](https://conference-manager-007.web.app)
- https://conf.snowcamp.io
- Test env: https://app-demo.voxxr.in/events/snc27-test/schedule
