/**
 * Email API Route
 * POST /api/email/send
 * 
 * Transactional email sending endpoint for Insturix
 * Handles no-reply emails via AWS SES
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, sendBatchEmails, type EmailParams } from '@/lib/services/email';

/**
 * Rate limiting: Consider implementing request-level rate limiting
 * using @upstash/ratelimit if needed to prevent API abuse
 */

/**
 * POST /api/email/send
 * Send transactional email(s) via AWS SES
 * 
 * Request body:
 * {
 *   "to": "user@example.com" | ["user1@example.com", "user2@example.com"],
 *   "subject": "Email subject",
 *   "htmlBody": "<html>...</html>",
 *   "textBody": "Plain text fallback" (optional),
 *   "replyTo": "support@insturix.com" (optional),
 *   "batch": false (optional, default: false)
 * }
 * 
 * For batch sends:
 * {
 *   "batch": true,
 *   "emails": [
 *     { "to": "user1@example.com", "subject": "...", "htmlBody": "..." },
 *     { "to": "user2@example.com", "subject": "...", "htmlBody": "..." }
 *   ]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Batch email sending
    if (body.batch && Array.isArray(body.emails)) {
      const emails: EmailParams[] = body.emails;

      // Validate batch size
      if (emails.length === 0) {
        return NextResponse.json(
          { error: 'Batch cannot be empty' },
          { status: 400 }
        );
      }

      if (emails.length > 1000) {
        return NextResponse.json(
          { 
            error: 'Batch too large. Maximum 1000 emails per request. Consider using a job queue for larger batches.' 
          },
          { status: 400 }
        );
      }

      // Validate each email in batch
      for (const email of emails) {
        if (!email.to || !email.subject || (!email.htmlBody && !email.textBody)) {
          return NextResponse.json(
            { error: 'Each email must have to, subject, and body (htmlBody or textBody)' },
            { status: 400 }
          );
        }
      }

      // Send batch
      const results = await sendBatchEmails(emails);
      const successCount = results.filter(r => r.success).length;

      return NextResponse.json({
        success: true,
        message: `Batch email sent: ${successCount}/${emails.length} successful`,
        results,
      }, { status: 200 });
    }

    // Single email sending
  const { to, subject, htmlBody, textBody, replyTo, cc, bcc, tags } = body;

    // Validate required fields
    if (!to || !subject || (!htmlBody && !textBody)) {
      return NextResponse.json(
        { 
          error: 'Missing required fields: to, subject, and body (htmlBody or textBody) are required' 
        },
        { status: 400 }
      );
    }

    // Send email
    const result = await sendEmail({
      to,
      subject,
      htmlBody,
      textBody,
      replyTo,
  cc,
  bcc,
  tags,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Email sent successfully',
        messageId: result.messageId,
      }, { status: 200 });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error,
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Email API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to send email' 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/email/send
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'AWS SES Email Service',
    region: 'ap-south-1',
    from: 'no-reply@insturix.com',
  }, { status: 200 });
}
