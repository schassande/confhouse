import { onRequest } from 'firebase-functions/https';
import * as logger from 'firebase-functions/logger';
import { admin } from '../common/firebase-admin';

export const createPerson = onRequest({ cors: true }, async (req, res) => {
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
        throw new Error('EMAIL_EXISTS');
      }

      const personsCol = db.collection('person');
      const newPersonRef = personsCol.doc(person.id || undefined);

      person.id = newPersonRef.id;
      person.lastUpdated = Date.now().toString();

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
