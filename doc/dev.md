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

### Frontend (Angular)
1. Install dependencies:
   ```sh
   cd frontend
   npm install
   ```
2. Start the dev server:
   ```sh
   ng serve
   ```

## Deployment

1. Build the frontend:
   ```sh
   cd frontend
   ng build --configuration production
   ```
2. Deploy to Firebase:
   ```sh
   firebase deploy
   ```

## Hosting access

- [https://conference-manager-007.web.app](https://conference-manager-007.web.app)
