interface ProgressConfig {
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

// Linear progress simulation up to 95%
export function simulateProgress(
  config: ProgressConfig,
  onProgress: (progress: number) => void,
  onComplete?: () => void
) {
  const {
    targetProgress = 0.95,
    duration,
    updateInterval = 100
  } = config;

  const startTime = Date.now();

  const progressInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const currentProgress = Math.min(elapsed / duration, targetProgress);

    onProgress(currentProgress);

    if (currentProgress >= targetProgress) {
      clearInterval(progressInterval);
      if (onComplete) {
        onComplete();
      }
    }
  }, updateInterval);

  // Return cleanup function
  return () => {
    clearInterval(progressInterval);
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

  const interval = setInterval(() => {
    waitTime = Math.max(0, waitTime - 1);
    if (waitTime > 0 && Math.random() < 0.1) {
      position = Math.max(1, position - 1);
    }

    onUpdate({ position, estimatedWaitTime: waitTime });

    if (waitTime === 0) {
      clearInterval(interval);
    }
  }, 1000);

  return () => clearInterval(interval);
}

// Simple linear estimation of queue wait time
export function estimateQueueWaitTime(position: number): number {
  const baseTime = 30; // Base time in seconds
  return Math.round(baseTime * position);
}