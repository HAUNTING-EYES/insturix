/**
 * Event Time Utility Functions
 * 
 * Utility functions for calculating event times and time until event
 * for ICS'25 ticket confirmation emails.
 */

/**
 * Get the event start date and time
 * Event: November 22, 2025, 9:00 AM IST (03:30 UTC)
 */
export function getEventStartDate(): Date {
  // November 22, 2025, 9:00 AM IST = 03:30 UTC
  // IST is UTC+5:30, so 9:00 AM IST = 3:30 AM UTC
  return new Date('2025-11-22T03:30:00.000Z');
}

/**
 * Calculate time until event and return human-readable string
 */
export function getTimeUntilEvent(currentTime: Date = new Date()): string {
  const eventDate = getEventStartDate();
  const timeUntilEvent = eventDate.getTime() - currentTime.getTime();

  return formatTimeUntilEvent(timeUntilEvent);
}

/**
 * Format milliseconds to human-readable time string
 * Examples: "7 days", "1 day", "30 minutes", "2 hours 15 minutes"
 */
export function formatTimeUntilEvent(milliseconds: number): string {
  if (milliseconds <= 0) {
    return 'Event has started';
  }

  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    if (remainingHours > 0) {
      return `${days} ${days === 1 ? 'day' : 'days'} ${remainingHours} ${remainingHours === 1 ? 'hour' : 'hours'}`;
    }
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    if (remainingMinutes > 0) {
      return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`;
    }
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }

  if (minutes > 0) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }

  return 'Less than a minute';
}

/**
 * Check if current time is within reminder window for a specific reminder type
 * Uses ±15 minutes tolerance
 */
export function isWithinReminderWindow(
  reminderType: 'reminder7Days' | 'reminder1Day' | 'reminder30Min',
  currentTime: Date = new Date(),
  eventTime: Date = getEventStartDate()
): boolean {
  const timeUntilEvent = eventTime.getTime() - currentTime.getTime();
  const windowTolerance = 15 * 60 * 1000; // 15 minutes in milliseconds

  switch (reminderType) {
    case 'reminder7Days': {
      const targetTime = 7 * 24 * 60 * 60 * 1000; // 7 days
      return (
        timeUntilEvent <= targetTime + windowTolerance &&
        timeUntilEvent >= targetTime - windowTolerance
      );
    }
    case 'reminder1Day': {
      const targetTime = 24 * 60 * 60 * 1000; // 1 day
      return (
        timeUntilEvent <= targetTime + windowTolerance &&
        timeUntilEvent >= targetTime - windowTolerance
      );
    }
    case 'reminder30Min': {
      const targetTime = 30 * 60 * 1000; // 30 minutes
      return (
        timeUntilEvent <= targetTime + windowTolerance &&
        timeUntilEvent >= targetTime - windowTolerance
      );
    }
    default:
      return false;
  }
}

/**
 * Get simulated time until event for testing purposes
 * Used in admin testing to simulate different reminder scenarios
 */
export function getSimulatedTimeUntilEvent(
  reminderType: 'reminder7Days' | 'reminder1Day' | 'reminder30Min'
): string {
  switch (reminderType) {
    case 'reminder7Days':
      return '7 days';
    case 'reminder1Day':
      return '1 day';
    case 'reminder30Min':
      return '30 minutes';
    default:
      return '';
  }
}

