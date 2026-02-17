import { admin } from '../common/firebase-admin';

/**
 * Creates or updates a person while maintaining the `person_emails` uniqueness index in a transaction.
 * Throws:
 * - `MISSING_EMAIL` when email is empty
 * - `EMAIL_EXISTS` when email already belongs to another person
 */
export async function upsertPersonWithEmailIndex(
  db: admin.firestore.Firestore,
  personInput: any
): Promise<any> {
  return await db.runTransaction(async (tx) => {
    const person = { ...(personInput ?? {}) };
    const email = String(person.email ?? '').trim();
    const emailKey = email.toLowerCase();
    if (!emailKey) {
      throw new Error('MISSING_EMAIL');
    }

    const personsCol = db.collection('person');
    const personRef = person.id ? personsCol.doc(person.id) : personsCol.doc();
    const personSnap = await tx.get(personRef);
    const currentStored = personSnap.exists ? personSnap.data() : null;

    const emailRef = db.collection('person_emails').doc(emailKey);
    const emailSnap = await tx.get(emailRef);
    const emailOwnerPersonId = String(emailSnap.data()?.personId ?? '');
    if (emailSnap.exists && emailOwnerPersonId !== personRef.id) {
      throw new Error('EMAIL_EXISTS');
    }

    const previousEmailKey = String(currentStored?.email ?? '').trim().toLowerCase();
    if (previousEmailKey && previousEmailKey !== emailKey) {
      const previousEmailRef = db.collection('person_emails').doc(previousEmailKey);
      const previousEmailSnap = await tx.get(previousEmailRef);
      const previousOwner = String(previousEmailSnap.data()?.personId ?? '');
      if (previousEmailSnap.exists && previousOwner === personRef.id) {
        tx.delete(previousEmailRef);
      }
    }

    person.id = personRef.id;
    person.email = email;
    person.lastUpdated = Date.now().toString();
    if (person.isPlatformAdmin === undefined) {
      person.isPlatformAdmin = false;
    }
    if (person.speaker && typeof person.speaker === 'object') {
      const submittedConferenceIds = Array.isArray(person.speaker.submittedConferenceIds)
        ? person.speaker.submittedConferenceIds
        : [];
      person.speaker.submittedConferenceIds = Array.from(
        new Set(
          submittedConferenceIds
            .map((value: any) => String(value ?? '').trim())
            .filter((value: string) => value.length > 0)
        )
      );
    }

    tx.set(personRef, person);
    tx.set(emailRef, {
      personId: personRef.id,
      email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return person;
  });
}
