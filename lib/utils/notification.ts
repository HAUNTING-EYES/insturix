

// // /**
// //  * Calculates the future expiration time based on a duration in hours.
// //  * @param duration The duration in hours (e.g., 24 for one day).
// //  * @returns An ISO 8601 string representing the expiration time.
// //  */
// // export function getExpiresAtFromDuration(duration: number): string {
// //   // duration * 60 minutes * 60 seconds * 1000 milliseconds
// //   const milliseconds = duration * 60 * 60 * 1000;
// //   const now = Date.now();
// //   const expiresAt = new Date(now + milliseconds);
// //   // Returns in UTC format (e.g., 2025-11-03T01:50:02.000Z), which is ideal for storage.
// //   return expiresAt.toISOString(); 
// // }

// // interface NotificationData {
// //   timestamp?: string; // creation time (for fallback)
// //   expiresAt?: string; // explicit expiration time
// //   duration?: number; // duration in hours (for fallback)
// // }

// // /**
// //  * Checks if a notification has expired using expiresAt primarily, 
// //  * or duration + timestamp as a fallback.
// //  * @param notification The notification object.
// //  * @returns true if the notification is expired, false otherwise.
// //  */
// // export function isNotificationExpired(notification: NotificationData): boolean {
// //   const now = Date.now();

// //   // 1. Primary check: Use explicit expiresAt time
// //   if (notification.expiresAt) {
// //     const expTime = new Date(notification.expiresAt).getTime();
    
// //     // Check for invalid date parsing (e.g., if the string is malformed)
// //     if (isNaN(expTime)) return true; 

// //     // Return true if expiration time is in the past
// //     return expTime < now;
// //   }

// //   // 2. Fallback check: Use timestamp + duration (for older or simpler updates)
// //   if (notification.timestamp && notification.duration) {
// //     const createdAt = new Date(notification.timestamp).getTime();
// //     const durationMs = notification.duration * 60 * 60 * 1000;
// //     const expiresAtFallback = createdAt + durationMs;
    
// //     // Check if the fallback expiration time is in the past
// //     return expiresAtFallback < now;
// //   }

// //   // 3. Default: If no expiry data is present, treat as permanent/non-expired
// //   return false;
// // }
// // // src/lib/utils/notification.ts

// // lib/utils/notification.ts
// // src/lib/utils/notification.ts

// /**
//  * Calculates the expiration time (in ISO format) for a given duration in hours.
//  * If duration = 0 or negative, returns undefined (indicating permanent).
//  */
// export function getExpiresAtFromDuration(duration: number): string | undefined {
//   if (!duration || duration <= 0) return undefined; // Permanent
//   const now = new Date();
//   const expiresAt = new Date(now.getTime() + duration * 60 * 60 * 1000);
//   return expiresAt.toISOString();
// }

// /**
//  * Interface describing a single notification structure.
//  */
// interface NotificationData {
//   expiresAt?: string;
//   timestamp?: string;
//   duration?: number;
// }

// /**
//  * Checks whether a notification has expired.
//  * Uses `expiresAt` primarily, and `timestamp + duration` as fallback.
//  */
// export function isNotificationExpired(notification: NotificationData): boolean {
//   if (!notification) return true;

//   const now = Date.now();

//   // ✅ Primary: check expiresAt
//   if (notification.expiresAt) {
//     const expTime = new Date(notification.expiresAt).getTime();
//     if (isNaN(expTime)) return true;
//     return expTime < now;
//   }

//   // ✅ Fallback: timestamp + duration
//   if (notification.timestamp && notification.duration) {
//     const createdAt = new Date(notification.timestamp).getTime();
//     const durationMs = notification.duration * 60 * 60 * 1000;
//     return createdAt + durationMs < now;
//   }

//   // ✅ If no expiry data → treat as permanent
//   return false;
// }
// lib/utils/notification.ts

export function getExpiresAtFromDuration(duration: number): string {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + duration * 60 * 60 * 1000);
  return expiresAt.toISOString();
}

export function isNotificationExpired(notification: any): boolean {
  if (!notification) return true;

  // If expiresAt exists, check that
  if (notification.expiresAt) {
    return new Date(notification.expiresAt) < new Date();
  }

  // Otherwise, compute from timestamp + duration
  if (notification.duration && notification.timestamp) {
    const expiration = new Date(
      new Date(notification.timestamp).getTime() +
        notification.duration * 60 * 60 * 1000
    );
    return expiration < new Date();
  }

  // If duration exists but timestamp is missing → treat as expired after duration hours
  if (notification.duration) {
    return false; // Active until backend cleanup
  }

  return true;
}
