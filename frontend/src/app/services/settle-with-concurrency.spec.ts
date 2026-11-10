import { describe, expect, it } from 'vitest';
import { settleWithConcurrency } from './settle-with-concurrency';

describe('settleWithConcurrency', () => {
  it('never exceeds the requested concurrency and preserves result order', async () => {
    let running = 0;
    let maximumRunning = 0;
    const results = await settleWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (value) => {
      running += 1;
      maximumRunning = Math.max(maximumRunning, running);
      await Promise.resolve();
      running -= 1;
      return value * 2;
    });

    expect(maximumRunning).toBeLessThanOrEqual(2);
    expect(results).toEqual([
      { status: 'fulfilled', value: 0 },
      { status: 'fulfilled', value: 2 },
      { status: 'fulfilled', value: 4 },
      { status: 'fulfilled', value: 6 },
      { status: 'fulfilled', value: 8 },
      { status: 'fulfilled', value: 10 },
    ]);
  });

  it('keeps processing after an individual failure', async () => {
    const failure = new Error('failed');
    const results = await settleWithConcurrency([1, 2, 3], 2, async (value) => {
      if (value === 2) {
        throw failure;
      }
      return value;
    });

    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 });
    expect(results[1]).toEqual({ status: 'rejected', reason: failure });
    expect(results[2]).toEqual({ status: 'fulfilled', value: 3 });
  });
});
