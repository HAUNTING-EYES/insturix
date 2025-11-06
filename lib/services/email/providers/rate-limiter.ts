export interface RateLimiterStats {
  processed: number;
  pending: number;
  rate: number;
  avgProcessTime: number;
}

export class RateLimiter {
  private readonly queue: Array<() => Promise<void>> = [];
  private processing = false;
  private lastSent = 0;
  private readonly minInterval: number;
  private readonly maxConcurrent: number;
  private activeCount = 0;
  private processedCount = 0;
  private totalProcessTime = 0;

  constructor(
    private readonly maxPerSecond: number,
    maxConcurrent: number = 3
  ) {
    const safeRate = maxPerSecond > 0 ? maxPerSecond * 0.9 : 1;
    this.minInterval = 1000 / safeRate;
    this.maxConcurrent = Math.max(1, maxConcurrent);
  }

  async schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      void this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0 || this.activeCount > 0) {
      // Process up to maxConcurrent tasks
      while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
        const now = Date.now();
        const elapsed = now - this.lastSent;

        if (elapsed < this.minInterval) {
          await new Promise(resolve => {
            const delay = this.minInterval - elapsed;
            setTimeout(resolve, delay);
          });
        }

        this.activeCount++;
        const job = this.queue.shift();
        if (job) {
          this.lastSent = Date.now();
          const startTime = Date.now();
          job()
            .finally(() => {
              this.activeCount--;
              this.processedCount++;
              this.totalProcessTime += Date.now() - startTime;
            });
        }
      }

      // Wait a bit before checking again
      if (this.activeCount > 0 || this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    this.processing = false;
  }

  getStats(): RateLimiterStats {
    return {
      processed: this.processedCount,
      pending: this.queue.length,
      rate: this.maxPerSecond,
      avgProcessTime: this.processedCount > 0 ? this.totalProcessTime / this.processedCount : 0,
    };
  }

  reset(): void {
    this.queue.length = 0;
    this.activeCount = 0;
    this.processedCount = 0;
    this.totalProcessTime = 0;
    this.lastSent = 0;
  }
}
