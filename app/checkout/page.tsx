import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import CheckoutFormWrapper from "../../components/ics25/CheckoutFormWrapper";
import { getIcs25Db } from "@/lib/ics25-mongo";
import Attendee from "@/schemas/ics25/Attendee";
import { Metadata } from "next";
import Script from "next/script";
import { ics25BreadcrumbSchema } from "@/lib/seo/ics25-schema";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://insturix.com";

export const metadata: Metadata = {
  title: "Buy ICS'25 Attendee Pass — Bronze, Silver, Gold, Creators | Insturix Creators Summit 2025",
  description:
    "Book your ICS'25 Attendee Pass — Bronze (free), Silver (₹2500), Gold (₹5000), Creators (₹3000). Access talks, workshops, networking, and GameOn esports at IIIT Delhi, Nov 22. Secure payment via Razorpay.",
  keywords: [
    "buy ICS25 creator pass",
    "ICS25 ticket price Delhi",
  "creator summit pass Bronze Silver Gold Creators",
    "ICS25 event pass registration",
    "Insturix Creators Summit 2025 ticket",
    "event pass checkout ICS25",
    "creator conference pass India",
    "ICS25 pass price tier",
    "book creator summit pass",
    "ICS25 Delhi November event",
  ],
  alternates: {
    canonical: "/checkout",
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: `${SITE_URL}/checkout`,
    title: "Buy ICS'25 Attendee Pass — Multiple Tiers Available",
    description:
      "Secure your spot at ICS'25 — choose your pass tier. Bronze, Silver, Gold, or Creators. Workshops, networking, and esports included.",
    siteName: "Insturix",
    images: [
      {
        url: "/ics25/ics25banner.png",
        width: 1200,
        height: 630,
        alt: "Buy ICS'25 Creator Pass - Insturix Creators Summit 2025",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@insturix",
    creator: "@insturix",
  title: "Buy ICS'25 Attendee Pass",
  description: "Choose your pass tier: Bronze, Silver, Gold, or Creators. Secure checkout via Razorpay.",
    images: ["/ics25/ics25banner.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const { userId } = await auth();
  if (!userId) {
    // Require sign-in before starting checkout; preserve selected tier if present
    const tier = typeof searchParams?.tier === 'string' ? searchParams?.tier : Array.isArray(searchParams?.tier) ? searchParams?.tier?.[0] : undefined;
    const redirectUrl = tier ? `/checkout?tier=${encodeURIComponent(tier)}` : "/checkout";
    redirect(`/signin?redirect_url=${encodeURIComponent(redirectUrl)}`);
  }

  // If the user already has an attendee pass, redirect to confirmation page
  await getIcs25Db();
  const existingAttendee = await Attendee.findOne({ clerkUserId: userId }).lean();
  if (existingAttendee && (existingAttendee as any).attendeePassTier) {
    redirect('/checkout/ics25/confirmation');
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-white dark:bg-zinc-950">
      {/* Structured Data for SEO */}
      <Script
        id="checkout-breadcrumb-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ics25BreadcrumbSchema) }}
      />
      <div className="relative z-20">
        <Navbar />
      </div>

      {/* Backdrop consistent with ICS’25 styling */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950" />
        <div className="absolute inset-0">
          <div className="absolute -top-24 -right-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-sky-500/15 via-transparent to-fuchsia-500/15 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-purple-500/15 via-transparent to-cyan-500/15 blur-3xl" />
        </div>
        <div className="absolute inset-0 bg-gradient-radial from-white/50 via-transparent to-transparent dark:from-zinc-800/40" />
      </div>

      <CursorEffect variant="glow" color="rgba(59, 130, 246, 0.09)" size={900} blur={180} />

      <main className="relative z-10 max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">Attendee Pass Checkout</h1>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">Select your pass and complete booking. Student and group discounts available where applicable.</p>
        </div>
        <CheckoutFormWrapper />
      </main>

      <div className="relative z-20">
        <Footer />
      </div>
    </div>
  );
}
