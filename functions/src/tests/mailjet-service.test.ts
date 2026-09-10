import test from 'node:test';
import assert from 'node:assert/strict';
import { MailjetService } from '../mail/mailjet-service';

const payload = {
  messageType: 'TEST_MESSAGE',
  subject: 'Test',
  recipients: [{ email: 'recipient@example.test' }],
};

test('MailjetService retries ECONNRESET and succeeds within the bounded policy', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.MAILJET_API_KEY;
  const originalSecretKey = process.env.MAILJET_SECRET_KEY;
  let calls = 0;

  process.env.MAILJET_API_KEY = 'test-api-key';
  process.env.MAILJET_SECRET_KEY = 'test-secret-key';
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls < 4) {
      throw Object.assign(new Error('socket reset'), { code: 'ECONNRESET' });
    }
    return new Response(JSON.stringify({ Messages: [{ To: [{ MessageID: 123 }] }] }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await new MailjetService({ fromEmail: 'sender@example.test' }).sendTransactionalEmail(payload);
    assert.equal(result.ok, true);
    assert.equal(calls, 4);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.MAILJET_API_KEY;
    else process.env.MAILJET_API_KEY = originalApiKey;
    if (originalSecretKey === undefined) delete process.env.MAILJET_SECRET_KEY;
    else process.env.MAILJET_SECRET_KEY = originalSecretKey;
  }
});

test('MailjetService stops after three retries for a persistent network error', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.MAILJET_API_KEY;
  const originalSecretKey = process.env.MAILJET_SECRET_KEY;
  let calls = 0;

  process.env.MAILJET_API_KEY = 'test-api-key';
  process.env.MAILJET_SECRET_KEY = 'test-secret-key';
  globalThis.fetch = (async () => {
    calls += 1;
    throw Object.assign(new Error('socket reset'), { code: 'ECONNRESET' });
  }) as typeof fetch;

  try {
    await assert.rejects(
      new MailjetService({ fromEmail: 'sender@example.test' }).sendTransactionalEmail(payload),
      /socket reset/
    );
    assert.equal(calls, 4);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.MAILJET_API_KEY;
    else process.env.MAILJET_API_KEY = originalApiKey;
    if (originalSecretKey === undefined) delete process.env.MAILJET_SECRET_KEY;
    else process.env.MAILJET_SECRET_KEY = originalSecretKey;
  }
});
