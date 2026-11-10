/**
 * Runs asynchronous tasks with a bounded number of concurrent executions.
 * Results preserve the order of the input items and include individual failures.
 *
 * @param items Items to process.
 * @param maxConcurrency Maximum number of tasks running at once.
 * @param task Asynchronous task applied to one item.
 * @returns Settled task results in input order.
 */
export async function settleWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  maxConcurrency: number,
  task: (item: TItem, index: number) => Promise<TResult>,
): Promise<PromiseSettledResult<TResult>[]> {
  const concurrency = Math.max(1, Math.floor(maxConcurrency));
  const results = new Array<PromiseSettledResult<TResult>>(items.length);
  let nextIndex = 0;

  /** Processes input items until no unclaimed index remains. */
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: 'fulfilled', value: await task(items[index], index) };
      } catch (reason: unknown) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
