import { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ICS25ClientContent from "@/components/ICS25ClientContent";
import PopupTrigger from "@/components/ics25/PopupTrigger";
import ScrollProgressBar from "@/components/ScrollProgressBar";
import Script from "next/script";
import { allIcs25Keywords } from "@/lib/seo/ics25-keywords";
import {
  ics25EventSchema,
  ics25FAQSchema,
  ics25BreadcrumbSchema,
} from "@/lib/seo/ics25-schema";
import ClientRedirectHandler from "@/components/ics25/ClientRedirectHandler";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://insturix.com";

export const metadata: Metadata = {
  title: "Insturix Creators Summit 2025 (ICS'25) — Creator Summit & GameOn | Nov 22, IIIT Delhi",
  description:
    "Join 800+ creators at ICS'25 in Delhi — AI-powered demos (Editron, Alyzitron, Musitron), live reel-making competitions, workshops, and GameOn esports (Valorant & BGMI). Register now — early spots & group discounts available.",
  keywords: allIcs25Keywords,
  authors: [{ name: "Insturix", url: SITE_URL }],
  creator: "Insturix",
  publisher: "Insturix",
  alternates: {
    canonical: "/ics25",
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: `${SITE_URL}/ics25`,
    title: "Insturix Creators Summit 2025 (ICS'25) — Creator Summit & GameOn | Nov 22, Delhi",
    description:
      "Join 800+ creators at India's largest student-led creator-tech summit. AI tool demos, live competitions, workshops, GameOn esports (Valorant & BGMI), networking & awards. Register now!",
    siteName: "Insturix",
    images: [
      {
        url: "/ics25/ics25banner.png",
        width: 1200,
        height: 630,
        alt: "ICS'25 - Insturix Creators Summit 2025 at IIIT Delhi",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@insturix",
    creator: "@insturix",
    title: "ICS'25 — Insturix Creators Summit 2025 | Nov 22, Delhi",
    description:
      "Join 800+ creators at ICS'25 — AI demos, live competitions, workshops, GameOn esports. Register now for early bird spots!",
    images: ["/ics25/ics25banner.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  other: {
    "event:start_date": "2025-11-22T10:00:00+05:30",
    "event:end_date": "2025-11-23T20:00:00+05:30",
    "event:location": "IIIT Delhi, New Delhi",
  },
};


export default function ICS25Page() {
  // Removed blocking server-side fetches - these will be handled client-side
  // for better performance and instant page load
  return (
    <div className="relative min-h-screen bg-white dark:bg-zinc-900 overflow-x-hidden">
      {/* Client-side redirect handler - runs in parallel with page render */}
      <ClientRedirectHandler />
      {/* Structured Data for SEO */}
      <Script
        id="ics25-event-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ics25EventSchema) }}
      />
      <Script
        id="ics25-faq-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ics25FAQSchema) }}
      />
      <Script
        id="ics25-breadcrumb-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ics25BreadcrumbSchema) }}
      />
      <ScrollProgressBar />
      <Navbar />
      <PopupTrigger context="ics25" />
      <ICS25ClientContent />
      <Footer />
    </div>
  );
}
