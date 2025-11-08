/**
 * Email Tracking Helper Functions
 * 
 * Utility functions for tracking which ticket confirmation and reminder emails
 * have been sent to attendees.
 */

import type { Ics25AttendeeDocument } from '@/schemas/ics25/Attendee';

export type EmailType = 'confirmation' | 'reminder7Days' | 'reminder1Day' | 'reminder30Min';

/**
 * Check if a specific email type has already been sent to an attendee
 */
export function hasEmailBeenSent(attendee: Ics25AttendeeDocument, emailType: EmailType): boolean {
  if (!attendee.emailSent) {
    return false;
  }

  switch (emailType) {
    case 'confirmation':
      return attendee.emailSent.confirmationSent === true;
    case 'reminder7Days':
      return attendee.emailSent.reminder7DaysSent === true;
    case 'reminder1Day':
      return attendee.emailSent.reminder1DaySent === true;
    case 'reminder30Min':
      return attendee.emailSent.reminder30MinSent === true;
    default:
      return false;
  }
}

/**
 * Mark a specific email type as sent for an attendee
 */
export async function markEmailSent(attendee: Ics25AttendeeDocument, emailType: EmailType): Promise<void> {
  if (!attendee.emailSent) {
    attendee.emailSent = {
      confirmationSent: false,
      reminder7DaysSent: false,
      reminder1DaySent: false,
      reminder30MinSent: false,
    } as any;
  }

  const now = new Date();

  switch (emailType) {
    case 'confirmation':
      attendee.emailSent.confirmationSent = true;
      attendee.emailSent.confirmationSentAt = now;
      break;
    case 'reminder7Days':
      attendee.emailSent.reminder7DaysSent = true;
      attendee.emailSent.reminder7DaysSentAt = now;
      break;
    case 'reminder1Day':
      attendee.emailSent.reminder1DaySent = true;
      attendee.emailSent.reminder1DaySentAt = now;
      break;
    case 'reminder30Min':
      attendee.emailSent.reminder30MinSent = true;
      attendee.emailSent.reminder30MinSentAt = now;
      break;
  }

  attendee.markModified('emailSent');
  await attendee.save();
}

/**
 * Check if a reminder should be sent based on the current time and event date
 */
export function shouldSendReminder(
  attendee: Ics25AttendeeDocument,
  reminderType: 'reminder7Days' | 'reminder1Day' | 'reminder30Min',
  eventDate: Date,
  currentTime: Date = new Date()
): boolean {
  // Check if email already sent
  if (hasEmailBeenSent(attendee, reminderType)) {
    return false;
  }

  // Check if attendee has confirmed ticket
  const hasConfirmedTicket =
    attendee.payment?.status === 'paid' ||
    attendee.attendeePassTier === 'bronze' ||
    attendee.attendeePassTier === 'silver';

  if (!hasConfirmedTicket) {
    return false;
  }

  // Calculate time until event
  const timeUntilEvent = eventDate.getTime() - currentTime.getTime();

  // Define reminder windows (±15 minutes tolerance)
  const windowTolerance = 15 * 60 * 1000; // 15 minutes in milliseconds

  switch (reminderType) {
    case 'reminder7Days': {
      const targetTime = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
      return (
        timeUntilEvent <= targetTime + windowTolerance &&
        timeUntilEvent >= targetTime - windowTolerance
      );
    }
    case 'reminder1Day': {
      const targetTime = 24 * 60 * 60 * 1000; // 1 day in milliseconds
      return (
        timeUntilEvent <= targetTime + windowTolerance &&
        timeUntilEvent >= targetTime - windowTolerance
      );
    }
    case 'reminder30Min': {
      const targetTime = 30 * 60 * 1000; // 30 minutes in milliseconds
      return (
        timeUntilEvent <= targetTime + windowTolerance &&
        timeUntilEvent >= targetTime - windowTolerance
      );
    }
    default:
      return false;
  }
}

