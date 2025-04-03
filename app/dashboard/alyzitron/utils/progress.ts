interface ProgressConfig {
  startDelay?: number;      // Delay before progress starts (ms)
  targetProgress: number;   // Target progress to reach (0-1)
  duration: number;         // Total duration in ms
  updateInterval?: number;  // How often to update progress (ms)
}

interface QueueState {
  position: number;
  estimatedWaitTime: number;
}

interface UploadProgress {
  progress: number;
  speed: number;  // bytes per second
  remaining: number;  // seconds
}

// Calculate upload progress, speed, and remaining time
export function calculateUploadProgress(
  loaded: number,
  total: number,
  startTime: number
): UploadProgress {
  const progress = loaded / total;
  const elapsed = (Date.now() - startTime) / 1000; // seconds
  const speed = loaded / elapsed; // bytes per second
  const remaining = (total - loaded) / speed;

  return {
    progress,
    speed,
    remaining,
  };
}

// Bezier curve easing function for smooth, realistic progress
function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

// Add some random variation to make progress feel more realistic
function addVariation(progress: number, amount = 0.05): number {
  const variation = (Math.random() - 0.5) * amount;
  return Math.max(0, Math.min(1, progress + variation));
}

// Format bytes to human readable size
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// Format bytes per second to human readable speed
export function formatSpeed(bytesPerSecond: number): string {
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let speed = bytesPerSecond;
  let unitIndex = 0;

  while (speed >= 1024 && unitIndex < units.length - 1) {
    speed /= 1024;
    unitIndex++;
  }

  return `${speed.toFixed(1)} ${units[unitIndex]}`;
}

// Simulate realistic progress up to 90%
export function simulateProgress(
  config: ProgressConfig,
  onProgress: (progress: number) => void,
  onComplete?: () => void
) {
  const {
    startDelay = 1000,
    targetProgress = 0.9,
    duration,
    updateInterval = 100
  } = config;

  let startTime: number | null = null;
  let progressInterval: NodeJS.Timeout | null = null;

  // Clear any existing interval
  if (progressInterval) {
    clearInterval(progressInterval);
  }

  // Initial delay to simulate setup/connection time
  setTimeout(() => {
    startTime = Date.now();

    progressInterval = setInterval(() => {
      if (!startTime) return;

      const elapsed = Date.now() - startTime;
      const rawProgress = Math.min(1, elapsed / duration);

      // Use easing function for smoother progress
      let currentProgress = easeOutCubic(rawProgress);

      // Add small random variations to make it feel more realistic
      currentProgress = addVariation(currentProgress, 0.02);

      // Cap progress at target (usually 90%)
      currentProgress = Math.min(currentProgress, targetProgress);

      onProgress(currentProgress);

      if (currentProgress >= targetProgress) {
        if (progressInterval) {
          clearInterval(progressInterval);
        }
        if (onComplete) {
          onComplete();
        }
      }
    }, updateInterval);
  }, startDelay);

  // Return cleanup function
  return () => {
    if (progressInterval) {
      clearInterval(progressInterval);
    }
  };
}

export function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) {
    return `${Math.ceil(seconds)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.ceil((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}

export function updateQueueState(
  initialPosition: number,
  initialWaitTime: number,
  onUpdate: (state: QueueState) => void
): () => void {
  let position = initialPosition;
  let waitTime = initialWaitTime;
  let interval: NodeJS.Timeout;

  // Update every second
  interval = setInterval(() => {
    // Decrease wait time
    waitTime = Math.max(0, waitTime - 1);

    // Randomly decrease queue position (more likely as wait time decreases)
    if (waitTime > 0 && Math.random() < (1 - waitTime / initialWaitTime) * 0.1) {
      position = Math.max(1, position - 1);
    }

    onUpdate({ position, estimatedWaitTime: waitTime });

    // Clear interval when wait time reaches 0
    if (waitTime === 0) {
      clearInterval(interval);
    }
  }, 1000);

  // Return cleanup function
  return () => clearInterval(interval);
}

// Generate a realistic initial wait time based on queue position
export function estimateQueueWaitTime(position: number): number {
  const baseTime = 30; // Base time in seconds
  const variationFactor = 0.2; // 20% variation

  // Add some randomness to make it feel more realistic
  const randomFactor = 1 + (Math.random() * 2 - 1) * variationFactor;
  
  // Wait time increases with queue position, but not linearly
  return Math.round(baseTime * Math.log(position + 1) * randomFactor);
}