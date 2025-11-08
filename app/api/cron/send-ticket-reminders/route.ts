import { NextRequest, NextResponse } from 'next/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Attendee from '@/schemas/ics25/Attendee';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import { User } from '@/schemas/user';
import { sendTicketReminderEmail } from '@/lib/services/email';
import { shouldSendReminder, markEmailSent } from '@/lib/services/email/ticket-email-tracking';
import { getEventStartDate, getTimeUntilEvent, formatTimeUntilEvent } from '@/lib/utils/event-time';

export async function GET(request: NextRequest) {
  try {
    // Vercel cron jobs are automatically authenticated
    // For manual testing, check for cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isVercelCron = request.headers.get('user-agent')?.includes('vercel-cron');

    if (!isVercelCron && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await getIcs25Db();
    await connectToDatabase();

    const eventDate = getEventStartDate();
    const currentTime = new Date();
    const timeUntilEvent = eventDate.getTime() - currentTime.getTime();

    // Don't send reminders if event has already started
    if (timeUntilEvent <= 0) {
      return NextResponse.json({
        success: true,
        timestamp: currentTime.toISOString(),
        message: 'Event has already started, no reminders to send',
        remindersSent: {
          reminder7Days: 0,
          reminder1Day: 0,
          reminder30Min: 0,
        },
      });
    }

    // Find all attendees with confirmed tickets
    const attendees = await Attendee.find({
      $or: [
        { 'payment.status': 'paid' },
        { attendeePassTier: 'bronze' },
        { attendeePassTier: 'silver' },
      ],
    }).lean();

    const results = {
      reminder7Days: { sent: 0, errors: [] as string[] },
      reminder1Day: { sent: 0, errors: [] as string[] },
      reminder30Min: { sent: 0, errors: [] as string[] },
    };

    // Process each attendee
    for (const attendeeData of attendees) {
      // Convert lean document to full document for tracking functions
      const attendee = await Attendee.findById(attendeeData._id);
      if (!attendee) continue;

      // Check and send 7 days reminder
      if (shouldSendReminder(attendee, 'reminder7Days', eventDate, currentTime)) {
        try {
          const user = await User.findOne({ clerkUserId: attendee.clerkUserId }).lean();
          const userName = user?.username || attendee.name || 'Valued User';
          const userEmail = user?.email || attendee.email;

          if (userEmail) {
            const ticketId = `TICKET-${(attendee._id as any).toString().slice(-8).toUpperCase()}`;
            const eventDetails = "Insturix Creator's Summit 2025";
            const timeUntilEventStr = getTimeUntilEvent(currentTime);

            const emailResult = await sendTicketReminderEmail(
              userEmail,
              'reminder7Days',
              userName,
              ticketId,
              eventDetails
            );

            if (emailResult.success) {
              await markEmailSent(attendee, 'reminder7Days');
              results.reminder7Days.sent++;
              console.log(`✅ 7-day reminder sent to ${userEmail}`);
            } else {
              results.reminder7Days.errors.push(`${userEmail}: ${emailResult.error}`);
              console.error(`❌ Failed to send 7-day reminder to ${userEmail}:`, emailResult.error);
            }
          }
        } catch (error: any) {
          results.reminder7Days.errors.push(`Error processing ${attendee.clerkUserId}: ${error.message}`);
          console.error(`Error sending 7-day reminder to ${attendee.clerkUserId}:`, error);
        }
      }

      // Check and send 1 day reminder
      if (shouldSendReminder(attendee, 'reminder1Day', eventDate, currentTime)) {
        try {
          const user = await User.findOne({ clerkUserId: attendee.clerkUserId }).lean();
          const userName = user?.username || attendee.name || 'Valued User';
          const userEmail = user?.email || attendee.email;

          if (userEmail) {
            const ticketId = `TICKET-${(attendee._id as any).toString().slice(-8).toUpperCase()}`;
            const eventDetails = "Insturix Creator's Summit 2025";

            const emailResult = await sendTicketReminderEmail(
              userEmail,
              'reminder1Day',
              userName,
              ticketId,
              eventDetails
            );

            if (emailResult.success) {
              await markEmailSent(attendee, 'reminder1Day');
              results.reminder1Day.sent++;
              console.log(`✅ 1-day reminder sent to ${userEmail}`);
            } else {
              results.reminder1Day.errors.push(`${userEmail}: ${emailResult.error}`);
              console.error(`❌ Failed to send 1-day reminder to ${userEmail}:`, emailResult.error);
            }
          }
        } catch (error: any) {
          results.reminder1Day.errors.push(`Error processing ${attendee.clerkUserId}: ${error.message}`);
          console.error(`Error sending 1-day reminder to ${attendee.clerkUserId}:`, error);
        }
      }

      // Check and send 30 min reminder
      if (shouldSendReminder(attendee, 'reminder30Min', eventDate, currentTime)) {
        try {
          const user = await User.findOne({ clerkUserId: attendee.clerkUserId }).lean();
          const userName = user?.username || attendee.name || 'Valued User';
          const userEmail = user?.email || attendee.email;

          if (userEmail) {
            const ticketId = `TICKET-${(attendee._id as any).toString().slice(-8).toUpperCase()}`;
            const eventDetails = "Insturix Creator's Summit 2025";

            const emailResult = await sendTicketReminderEmail(
              userEmail,
              'reminder30Min',
              userName,
              ticketId,
              eventDetails
            );

            if (emailResult.success) {
              await markEmailSent(attendee, 'reminder30Min');
              results.reminder30Min.sent++;
              console.log(`✅ 30-minute reminder sent to ${userEmail}`);
            } else {
              results.reminder30Min.errors.push(`${userEmail}: ${emailResult.error}`);
              console.error(`❌ Failed to send 30-minute reminder to ${userEmail}:`, emailResult.error);
            }
          }
        } catch (error: any) {
          results.reminder30Min.errors.push(`Error processing ${attendee.clerkUserId}: ${error.message}`);
          console.error(`Error sending 30-minute reminder to ${attendee.clerkUserId}:`, error);
        }
      }
    }

    const response = {
      success: true,
      timestamp: currentTime.toISOString(),
      eventDate: eventDate.toISOString(),
      timeUntilEvent: formatTimeUntilEvent(timeUntilEvent),
      remindersSent: {
        reminder7Days: results.reminder7Days.sent,
        reminder1Day: results.reminder1Day.sent,
        reminder30Min: results.reminder30Min.sent,
      },
      errors: {
        reminder7Days: results.reminder7Days.errors,
        reminder1Day: results.reminder1Day.errors,
        reminder30Min: results.reminder30Min.errors,
      },
      totalAttendeesChecked: attendees.length,
    };

    console.log('Ticket reminder cron job completed:', response);

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Ticket reminder cron job failed:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

