/**
 * Generates non-linear progress values for a more realistic progress bar experience
 */
export class ProgressGenerator {
  private readonly startTime: number;
  private readonly estimatedTime: number;

  constructor(estimatedTimeInSeconds: number) {
    this.startTime = Date.now();
    this.estimatedTime = estimatedTimeInSeconds * 1000; // Convert to milliseconds
  }

  /**
   * Calculate current progress with micro-fluctuations
   */
  calculateProgress(): number {
    const elapsed = Date.now() - this.startTime;
    const progress = this.nonLinearProgress(elapsed / this.estimatedTime);
    
    // Add small random fluctuations (±1%)
    const fluctuation = (Math.random() - 0.5) * 0.02;
    
    // Ensure progress stays between 0 and 0.9 (90%)
    return Math.min(Math.max(progress + fluctuation, 0), 0.9);
  }

  /**
   * Non-linear progress curve that slows down as it approaches completion
   */
  private nonLinearProgress(x: number): number {
    // Use a combination of logarithmic and exponential functions
    // This creates a curve that starts fast and slows down
    if (x <= 0) return 0;
    if (x >= 1) return 0.9;

    // Start fast, then slow down
    const base = 1 - Math.exp(-3 * x);
    // Add some randomness to make it less predictable
    const randomFactor = 1 + (Math.random() - 0.5) * 0.1;
    
    return base * 0.9 * randomFactor;
  }

  /**
   * Get estimated time remaining in seconds
   */
  getTimeRemaining(): number {
    const elapsed = Date.now() - this.startTime;
    const progress = this.calculateProgress();
    
    if (progress <= 0) return this.estimatedTime / 1000;
    
    const estimatedTotal = elapsed / progress;
    return Math.max(0, (estimatedTotal - elapsed) / 1000);
  }

  /**
   * Format time remaining into human-readable string
   */
  static formatTimeRemaining(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)} seconds`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  }
}

/**
 * Calculate upload progress with speed
 */
export function calculateUploadProgress(
  uploaded: number,
  total: number,
  startTime: number
): {
  progress: number;
  speed: number;
  remaining: number;
} {
  const progress = Math.min(uploaded / total, 1);
  const elapsed = (Date.now() - startTime) / 1000; // seconds
  const speed = uploaded / elapsed; // bytes per second
  
  const remaining = progress < 1 ? (total - uploaded) / speed : 0;

  return {
    progress,
    speed,
    remaining,
  };
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Format speed in human-readable format
 */
export function formatSpeed(bytesPerSecond: number): string {
  return `${formatFileSize(bytesPerSecond)}/s`;
}