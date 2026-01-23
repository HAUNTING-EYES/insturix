import { isGenerationTemporarilyUnavailable } from '../errors/thinkforge-error';

export async function retryOnceOnOverload<T>(
  fn: () => Promise<T>,
  delayMs: number = 700
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isGenerationTemporarilyUnavailable(error)) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return await fn();
  }
}
