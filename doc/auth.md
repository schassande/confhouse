# Authentication

This document describes the authentication mechanisms currently implemented in the application.

## Overview

The application relies on Firebase Authentication for authentication and Firestore for application data.

The currently supported providers are:

- `email/password`
- `google.com`
- `github.com`

The main frontend entry point is [`frontend/src/app/services/usersign.service.ts`](/c:/data/perso/snowcamp/confhouse/frontend/src/app/services/usersign.service.ts).

## General Principles

- Firebase Auth creates or authenticates the technical user account.
- The Firestore `person` collection stores the application profile.
- The `Person` profile is loaded by email after authentication.
- Firebase session persistence uses `browserLocalPersistence`, so the session survives browser refreshes.
- The current application state is stored in two Angular signals:
  - `_user` for the Firebase `User`
  - `_person` for the application `Person`

## Supported Providers

### Email / password

Sign-up flow:

1. create the Firebase account with `createUserWithEmailAndPassword`
2. create or load the `Person` through the `createPerson` Cloud Function
3. send a Firebase verification email
4. store a temporary verification context in `sessionStorage`
5. immediately sign the user out
6. redirect to `/email-not-verified`

Login flow:

1. authenticate with `signInWithEmailAndPassword`
2. reload the Firebase `User` with `reload`
3. check `user.emailVerified`
4. if the email is not verified:
   - sign the user out
   - redirect to `/email-not-verified`
5. otherwise load the `Person` and open the application session

### Google

Flow:

1. authenticate with `signInWithPopup(new GoogleAuthProvider())`
2. create the `Person` if needed
3. check `user.emailVerified`
4. if Firebase considers the email verified, the session is accepted
5. otherwise the email verification flow is applied just like for `email/password`

Expected policy:

- the project follows Firebase policy
- Google may provide an account with `emailVerified = true`
- the code does not make business exceptions based on the provider name
- only the actual `user.emailVerified` value is used

### GitHub

Flow:

1. authenticate with `GithubAuthProvider`
2. create the `Person` if needed
3. check `user.emailVerified`
4. if Firebase returns `false`, the user is signed out and moved to the email verification flow

Consequence:

- unlike Google, GitHub is not automatically treated as sufficient proof of email verification
- the application follows Firebase behavior here, not a custom business rule

## Existing Accounts With Another Provider

The service explicitly handles `auth/account-exists-with-different-credential`.

Behavior:

- existing sign-in methods are loaded with `fetchSignInMethodsForEmail`
- if the account already exists with Google, the user must sign in with Google
- if the account already exists with GitHub, the user must sign in with GitHub
- if the account already exists with `password`, the user must first sign in with email/password
- `linkWithCredential` is attempted when the context allows it

## Application `Person` Profile

The application profile is distinct from the Firebase Auth account.

Current rules:

- during `email/password` sign-up, the Firebase UID becomes the `Person` ID
- on the first OAuth login, a `Person` is created from the Firebase `User`
- email uniqueness on the application side is enforced through the `createPerson` Cloud Function
- if `createPerson` returns `409`, the existing profile is reloaded from Firestore

## `person_emails` Collection

The `person_emails` collection acts as a uniqueness index between an email address and an application `Person` account.

Purpose:

- guarantee that an email address is associated with only one `Person` document
- prevent creation of multiple application profiles with the same email
- centralize uniqueness checks in a backend transactional mechanism

Principle:

- the document key matches the normalized email address
- the document associates that email with a `Person` identifier
- this collection is not meant to be manipulated directly by the frontend

Primary usage:

- it is mainly used during account creation
- it is also useful when creating a `Person` for the first time from an OAuth provider

Creation flow:

1. the frontend creates or authenticates the Firebase user
2. the frontend calls the `createPerson` Cloud Function
3. the Cloud Function attempts to reserve the email in `person_emails`
4. if the email is not already present:
   - the index entry is created
   - the application `Person` is created
5. if the email already exists:
   - the function returns HTTP `409`
   - the frontend then reloads the existing `Person` by email

Functional consequence:

- the same email cannot be attached to multiple application `Person` accounts
- this protects sign-up and first OAuth login flows against application-level duplicates

Technical consequence:

- uniqueness does not rely only on Firebase Auth
- it is also guaranteed at the application domain model level

## `person_emails` Security

The `person_emails` collection is explicitly inaccessible from the client.

Current Firestore rule:

```txt
match /person_emails/{email} {
  allow read, write: if false;
}
```

This means:

- no direct reads from the frontend application
- no direct writes from the browser
- only controlled backend operations, especially the `createPerson` Cloud Function, can maintain this index

## Session Persistence and Restoration

Firebase persistence is configured with `browserLocalPersistence`.

At application startup:

1. `onAuthStateChanged` is triggered
2. if no Firebase user is present, the signals are cleared
3. otherwise the `User` is reloaded with `reload`
4. if `emailVerified` is false:
   - the user is signed out
   - the application redirects to `/email-not-verified`
5. if `emailVerified` is true:
   - the `Person` is loaded
   - the application context is restored

## Dedicated Email Verification Pages

### `/email-not-verified`

Component: [`frontend/src/app/pages/person/email-not-verified/email-not-verified.component.ts`](/c:/data/perso/snowcamp/confhouse/frontend/src/app/pages/person/email-not-verified/email-not-verified.component.ts)

Role:

- inform the user that the account is not active yet
- display the related email address
- offer to resend the activation link
- offer a link back to `/login`

### `/verify-email`

Component: [`frontend/src/app/pages/person/verify-email/verify-email.component.ts`](/c:/data/perso/snowcamp/confhouse/frontend/src/app/pages/person/verify-email/verify-email.component.ts)

Role:

- receive the Firebase parameters `mode`, `oobCode`, and `continueUrl`
- apply the Firebase action code with `applyActionCode`
- display success or failure
- redirect the user back to `/login`

## Resending the Verification Email

Resending is done from `/email-not-verified`.

Mechanism:

- a temporary context is stored in `sessionStorage` under the `pendingEmailVerification` key
- this context contains:
  - the email
  - an `idToken`
  - a `continueUrl`
  - the creation timestamp
- resend uses the Firebase Identity Toolkit REST API `accounts:sendOobCode`
- the `X-Firebase-Locale` header is populated with the current language

Limitations:

- if the `idToken` has expired, resend fails
- in that case the user must sign in again to start a new verification cycle

## `continueUrl` Handling

The application stores a `returnUrl` in `sessionStorage` through [`frontend/src/app/services/redirect.service.ts`](/c:/data/perso/snowcamp/confhouse/frontend/src/app/services/redirect.service.ts).

Purpose:

- send the user back to the originally requested page after login
- avoid loops during the email verification flow

The following routes are explicitly excluded as return targets:

- `/login`
- `/signup`
- `/verify-email`
- `/email-not-verified`

If a `returnUrl` is not safe, the application falls back to `/login`.

## Angular Guards

### `AuthGuard`

File: [`frontend/src/app/guards/auth.guard.ts`](/c:/data/perso/snowcamp/confhouse/frontend/src/app/guards/auth.guard.ts)

Behavior:

- allows access if an application `Person` is present in memory
- otherwise stores the requested URL
- redirects to `/login?returnUrl=...`

Note:

- email verification is not performed directly inside the guard
- it is enforced earlier by `UserSignService`

### Business guards

Other guards use the already loaded application `Person`:

- `AdminGuard`
- `ConferenceOrganizerGuard`
- `ConferenceManageContextGuard`
- `ConferenceCreateGuard`

They do not reimplement Firebase Auth logic; they rely on the already validated session.

## Password Reset

The "forgot password" flow uses Firebase Auth directly:

- `sendPasswordResetEmail`
- available from `/login`

## Internationalization

Authentication-related user messages are translated in:

- [`frontend/src/assets/i18n/en.json`](/c:/data/perso/snowcamp/confhouse/frontend/src/assets/i18n/en.json)
- [`frontend/src/assets/i18n/fr.json`](/c:/data/perso/snowcamp/confhouse/frontend/src/assets/i18n/fr.json)

The main relevant keys are:

- `LOGIN.*`
- `SIGNUP.*`
- `AUTH.EMAIL_NOT_VERIFIED.*`
- `AUTH.VERIFY_EMAIL.*`

## Firestore Security

Firestore rules now enforce email verification for sensitive authenticated operations.

File: [`firestore.rules`](/c:/data/perso/snowcamp/confhouse/firestore.rules)

Central mechanism:

```txt
function isVerifiedUser() {
  return request.auth != null
    && request.auth.token.email_verified == true;
}
```

This control is notably used for:

- creating and updating `person`
- creating and updating conferences
- organizer actions
- creating and updating sessions
- sponsor management
- platform admin actions

Consequence:

- a signed-in but unverified user cannot perform these writes even if a Firebase session technically exists

## Expected Firebase Configuration

For the flow to work correctly, Firebase must be configured with a custom email action page.

Expected setup:

- the action URL of the "Email address verification" template must point to `/verify-email`
- the chosen domain must be present in `Authorized domains`

Example:

- handler: `https://my-domain/verify-email`
- `continueUrl` supplied by the application: `https://my-domain/login` or another safe business page

## Limitations and Points of Attention

- reads on some Firestore collections remain broadly public by design in the current rules
- verification email resend depends on a temporary `idToken` stored in session storage
- if Firebase email template configuration is not aligned with `/verify-email`, the dedicated page will not be used
- verification logic relies on `user.emailVerified` and `request.auth.token.email_verified`, in line with Firebase

## Main Files

- [`frontend/src/app/services/usersign.service.ts`](/c:/data/perso/snowcamp/confhouse/frontend/src/app/services/usersign.service.ts)
- [`frontend/src/app/services/redirect.service.ts`](/c:/data/perso/snowcamp/confhouse/frontend/src/app/services/redirect.service.ts)
- [`frontend/src/app/pages/person/login/login.component.ts`](/c:/data/perso/snowcamp/confhouse/frontend/src/app/pages/person/login/login.component.ts)
- [`frontend/src/app/pages/person/signup/signup.component.ts`](/c:/data/perso/snowcamp/confhouse/frontend/src/app/pages/person/signup/signup.component.ts)
- [`frontend/src/app/pages/person/email-not-verified/email-not-verified.component.ts`](/c:/data/perso/snowcamp/confhouse/frontend/src/app/pages/person/email-not-verified/email-not-verified.component.ts)
- [`frontend/src/app/pages/person/verify-email/verify-email.component.ts`](/c:/data/perso/snowcamp/confhouse/frontend/src/app/pages/person/verify-email/verify-email.component.ts)
- [`frontend/src/app/guards/auth.guard.ts`](/c:/data/perso/snowcamp/confhouse/frontend/src/app/guards/auth.guard.ts)
- [`firestore.rules`](/c:/data/perso/snowcamp/confhouse/firestore.rules)
