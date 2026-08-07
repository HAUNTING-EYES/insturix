import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  createConsentRequestFingerprint,
  isValidEmailAddress,
  NEWSLETTER_CONSENT_SOURCE,
  NEWSLETTER_NOTICE_VERSION,
  NEWSLETTER_TOPIC,
  normalizeEmailAddress,
} from "@/lib/services/email/contact-policy";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import EmailConsentEvent from "@/schemas/EmailConsentEventSchema";
import EmailContact from "@/schemas/EmailContactSchema";
import EmailSuppression from "@/schemas/EmailSuppressionSchema";

interface NewsletterRequestBody {
  email?: unknown;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function getRequestFingerprint(request: NextRequest): string | undefined {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress =
    forwardedFor?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined;

  return createConsentRequestFingerprint({
    ipAddress,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
}

async function updateContact(
  contactId: unknown,
  normalizedEmail: string,
  occurredAt: Date,
  isSuppressed: boolean
) {
  return EmailContact.findByIdAndUpdate(
    contactId,
    {
      $set: {
        normalizedEmail,
        status: isSuppressed ? "suppressed" : "active",
        unsubscribeAll: false,
        source: NEWSLETTER_CONSENT_SOURCE,
        lastConsentAt: occurredAt,
        [`preferences.${NEWSLETTER_TOPIC}`]: {
          status: "opted_in",
          source: NEWSLETTER_CONSENT_SOURCE,
          updatedAt: occurredAt,
        },
      },
    },
    { new: true, runValidators: true }
  );
}

async function upsertNewsletterContact(
  normalizedEmail: string,
  occurredAt: Date,
  isSuppressed: boolean
) {
  const existingContact = await EmailContact.findOne({
    $or: [
      { normalizedEmail },
      {
        email: {
          $regex: `^${escapeRegExp(normalizedEmail)}$`,
          $options: "i",
        },
      },
    ],
  }).select("_id");

  if (existingContact) {
    try {
      return await updateContact(
        existingContact._id,
        normalizedEmail,
        occurredAt,
        isSuppressed
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }

  try {
    return await EmailContact.findOneAndUpdate(
      { normalizedEmail },
      {
        $set: {
          normalizedEmail,
          status: isSuppressed ? "suppressed" : "active",
          unsubscribeAll: false,
          source: NEWSLETTER_CONSENT_SOURCE,
          lastConsentAt: occurredAt,
          [`preferences.${NEWSLETTER_TOPIC}`]: {
            status: "opted_in",
            source: NEWSLETTER_CONSENT_SOURCE,
            updatedAt: occurredAt,
          },
        },
        $setOnInsert: {
          email: normalizedEmail,
        },
      },
      { new: true, runValidators: true, upsert: true }
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const canonicalContact = await EmailContact.findOne({
      normalizedEmail,
    }).select("_id");
    if (!canonicalContact) {
      throw error;
    }

    return updateContact(
      canonicalContact._id,
      normalizedEmail,
      occurredAt,
      isSuppressed
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as
      | NewsletterRequestBody
      | null;

    if (typeof body?.email !== "string") {
      return NextResponse.json(
        { error: "A valid email address is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = normalizeEmailAddress(body.email);
    if (!isValidEmailAddress(normalizedEmail)) {
      return NextResponse.json(
        { error: "A valid email address is required" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const activeSuppression = await EmailSuppression.exists({
      normalizedEmail,
      active: true,
      $or: [{ scope: "global" }, { scope: "topic", topic: NEWSLETTER_TOPIC }],
    });
    const occurredAt = new Date();

    // Consent evidence is written first. If the contact update fails, the
    // address remains ineligible rather than becoming eligible without proof.
    await EmailConsentEvent.create({
      eventId: randomUUID(),
      normalizedEmail,
      topic: NEWSLETTER_TOPIC,
      action: "opt_in",
      actorType: "visitor",
      source: NEWSLETTER_CONSENT_SOURCE,
      noticeVersion: NEWSLETTER_NOTICE_VERSION,
      requestFingerprint: getRequestFingerprint(request),
      occurredAt,
    });

    await upsertNewsletterContact(
      normalizedEmail,
      occurredAt,
      Boolean(activeSuppression)
    );

    return NextResponse.json(
      {
        success: true,
        message: "Newsletter subscription submitted successfully",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error processing newsletter subscription:", error);
    return NextResponse.json(
      { error: "Failed to process newsletter subscription" },
      { status: 500 }
    );
  }
}
