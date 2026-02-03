/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions";
import {onRequest} from "firebase-functions/https";
import * as logger from "firebase-functions/logger";
import * as admin from 'firebase-admin';

// Initialize the Admin SDK
if (!admin.apps.length) {
	admin.initializeApp();
}

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

/**
 * HTTP endpoint to create a Person while guaranteeing unique email.
 *
 * Request: POST JSON body with a `Person` object (see frontend `person.model.ts`).
 * Behavior: uses a `person_emails` collection as an index where document id = lowercased email.
 * The function runs a transaction: if the email index exists, it returns 409; otherwise it
 * creates a new document in `person` collection and an index doc in `person_emails`.
 */
export const createPerson = onRequest(async (req, res) => {
	// Enable CORS
	res.set('Access-Control-Allow-Origin', '*');
	res.set('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
	res.set('Access-Control-Allow-Headers', 'Content-Type');

	// Handle preflight requests
	if (req.method === 'OPTIONS') {
		res.status(204).send('');
		return;
	}

	try {
		if (req.method !== 'POST') {
			res.status(405).send({ error: 'Method Not Allowed, use POST' });
			return;
		}

		const person = req.body;
		if (!person || !person.email) {
			res.status(400).send({ error: 'Missing person or email in request body' });
			return;
		}

		const emailKey = String(person.email).trim().toLowerCase();
		const db = admin.firestore();

		const result = await db.runTransaction(async (tx) => {
			const emailRef = db.collection('person_emails').doc(emailKey);
			const emailSnap = await tx.get(emailRef);
			if (emailSnap.exists) {
				// Indicate to caller that email already exists
				throw new Error('EMAIL_EXISTS');
			}

			const personsCol = db.collection('person');
			const newPersonRef = personsCol.doc(person.id || undefined );

			// Ensure id and lastUpdated fields exist and match frontend expectations
			person.id = newPersonRef.id;
			person.lastUpdated = Date.now().toString();

			// Ensure isPlatformAdmin defaults to false when not provided
			if (person.isPlatformAdmin === undefined) {
				person.isPlatformAdmin = false;
			}

			tx.set(newPersonRef, person);
			tx.set(emailRef, {
				personId: newPersonRef.id,
				email: person.email,
				createdAt: admin.firestore.FieldValue.serverTimestamp(),
			});

			return person;
		});

		res.status(201).send({ person: result });
	} catch (err: any) {
		logger.error('createPerson error', err);
		if (err && err.message === 'EMAIL_EXISTS') {
			res.status(409).send({ error: 'Email already exists', code: 'EMAIL_EXISTS' });
			return;
		}
		res.status(500).send({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' });
	}
});

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
