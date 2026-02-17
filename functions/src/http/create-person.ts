import { onRequest } from 'firebase-functions/https';
import * as logger from 'firebase-functions/logger';
import { admin } from '../common/firebase-admin';
import { upsertPersonWithEmailIndex } from './person-upsert';

export const createPerson = onRequest({ cors: true, timeoutSeconds: 60 }, async (req, res) => {
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

    const db = admin.firestore();
    const result = await upsertPersonWithEmailIndex(db, person);

    res.status(201).send({ person: result });
  } catch (err: any) {
    logger.error('createPerson error', err);
    if (err && err.message === 'EMAIL_EXISTS') {
      res.status(409).send({ error: 'Email already exists', code: 'EMAIL_EXISTS' });
      return;
    }
    if (err && err.message === 'MISSING_EMAIL') {
      res.status(400).send({ error: 'Missing person or email in request body', code: 'MISSING_EMAIL' });
      return;
    }
    res.status(500).send({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' });
  }
});
