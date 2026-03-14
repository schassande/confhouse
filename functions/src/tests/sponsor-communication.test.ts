import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateNextSponsorAcceptedNumber,
  buildSponsorAccountingDocumentNumber,
  buildSponsorCommunicationRecipients,
  resolveSponsorCommunicationLanguage,
} from '../sponsor/sponsor-communication';

test('allocateNextSponsorAcceptedNumber increments the conference counter', () => {
  const allocation = allocateNextSponsorAcceptedNumber(7);
  assert.equal(allocation.acceptedNumber, 8);
  assert.equal(allocation.nextCounter, 8);
});

test('buildSponsorAccountingDocumentNumber pads accepted numbers to two digits', () => {
  assert.equal(buildSponsorAccountingDocumentNumber({ edition: 2026 }, { acceptedNumber: 7 }), '2026-07');
});

test('resolveSponsorCommunicationLanguage prefers sponsor locale and falls back to conference languages', () => {
  assert.equal(resolveSponsorCommunicationLanguage({ communicationLanguage: 'fr' }, { languages: ['EN'] }), 'fr');
  assert.equal(resolveSponsorCommunicationLanguage({}, { languages: ['FR', 'EN'] }), 'fr');
  assert.equal(resolveSponsorCommunicationLanguage({}, { languages: ['EN'] }), 'en');
});

test('buildSponsorCommunicationRecipients includes optional conference cc email', () => {
  const recipients = buildSponsorCommunicationRecipients(
    {
      name: 'Example Corp',
      adminEmails: ['contact@example.test'],
    },
    {
      sponsoring: {
        ccEmail: 'orga@example.test',
      },
    }
  );

  assert.deepEqual(recipients.to, [{ email: 'contact@example.test', name: 'Example Corp' }]);
  assert.deepEqual(recipients.cc, [{ email: 'orga@example.test' }]);
});
