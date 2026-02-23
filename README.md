# Conference Manager

Conference Manager is a web application to run a technical conference end-to-end: configure the event, manage sessions and speakers, plan the schedule, and publish the final program.

## Objective

The main goal is **conference operations management**:
- Prepare and configure a conference.
- Manage the CFP lifecycle and internal program decisions.
- Build and maintain the conference schedule.
- Publish conference data to external platforms.

## External Integrations

- **Conference Hall**: used for the CFP side (importing proposals/speakers and syncing CFP-related data).
- **Voxxrin**: used for publication (event descriptor generation and publication-oriented configuration).

## Key Features

- Conference creation and administration.
- Conference configuration:
  - General settings.
  - Session types.
  - Tracks.
  - Rooms.
  - Planning structure (days/slots).
- Session management:
  - Session list.
  - Session create/edit.
  - Import from Conference Hall.
- Speaker management:
  - Conference speaker list.
  - Availability management.
- Program allocation:
  - Assign sessions to slots and rooms.
- Activities management:
  - Activity setup.
  - Activity participation tracking.
  - Activity admin pages.
- Sponsor management:
  - Sponsor configuration.
  - Sponsor operations.
- Publication:
  - Voxxrin configuration.
  - Voxxrin event descriptor export.
  - Planning PDF/ZIP exports.
- Dashboards and operational monitoring for conference management.
- Platform administration:
  - Person administration.
  - Platform-level configuration.

## License

This project is licensed under the **LGPL**.

## Tech Stack

### Frontend
- **Angular 21**
- **TypeScript**
- **Angular Router**
- **AngularFire** (`@angular/fire`)
- **PrimeNG + PrimeIcons**
- **ngx-translate** (i18n)
- **RxJS**

### Backend
- **Firebase Cloud Functions** (HTTP + scheduled jobs)
- **Node.js 24**
- **TypeScript**
- **Firebase Admin SDK**

### Data and Hosting
- **Cloud Firestore** (persistent data)
- **Firebase Authentication**
- **Firebase Hosting**
- **Firebase Emulator Suite** (local development)

## Project Structure

- `frontend/`: Angular application.
- `functions/`: Firebase Cloud Functions.
- `doc/`: functional and technical documentation.

## Documentation

- [Development Notes](doc/dev.md)
- [Pages Documentation](doc/pages.md)
- [Data Model](doc/datamodel.md)
- [TODO List](doc/TODO.md)
- [Test Guide](doc/TEST_GUIDE.md)
- [Voxxrin JSON Schema](doc/voxxrin.jsonschema)


