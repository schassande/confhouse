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
3. Deploy only Storage rules (optional):
   ```sh
   firebase deploy --only storage
   ```
4. Deploy only the Voxxrin generation function (optional):
   ```sh
   firebase deploy --only functions:generateVoxxrinEventDescriptor
   ```

## Hosting access

- [https://conference-manager-007.web.app](https://conference-manager-007.web.app)
