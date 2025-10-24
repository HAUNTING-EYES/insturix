import { Metadata } from "next";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ICS25ClientContent from "@/components/ICS25ClientContent";
import PopupTrigger from "@/components/ics25/PopupTrigger";
import ScrollProgressBar from "@/components/ScrollProgressBar";

export const metadata: Metadata = {
  title: "ICS'25 - Insturix Creator's Summit 2025",
  description: "Join the biggest creator event of 2025. Where creators collide, collaborate & create magic. Attendee passes, live competitions, AI tools showcase, networking and more.",
  alternates: {
    canonical: "/ics25",
  },
  openGraph: {
    title: "ICS'25 - Insturix Creator's Summit 2025",
  description: "Join the biggest creator event of 2025. Where creators collide, collaborate & create magic.",
    images: [
      {
        url: "/icons/ics25-og.jpg",
        width: 1200,
        height: 630,
        alt: "ICS'25 - Insturix Creator's Summit 2025",
      },
    ],
  },
};


export default async function ICS25Page() {
  // Check if user is already registered as an attendee
  try {
    const res = await fetch('/api/ics25/attendees', { cache: 'no-store', headers: { 'accept': 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      if (data?.attendee?.attendeePassTier) {
        redirect('/checkout/success');
      }
    }
  } catch {
    // If check fails, continue to render landing page
  }

  // Auto-open portal when a signed-in player already has esports registration
  // We call the same endpoint used elsewhere; cookies are forwarded in server components
  try {
    const res = await fetch('/api/ics25/players/me', { cache: 'no-store', headers: { 'accept': 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      if (data?.player) {
        redirect('/ics25/my');
      }
    }
    // If 401 or no player found, continue to render landing page
  } catch {
    // On any error (e.g., during build or missing route), gracefully fall through to landing page
  }
  return (
    <div className="relative min-h-screen bg-white dark:bg-zinc-900 overflow-x-hidden">
      <ScrollProgressBar />
      <Navbar />
      <PopupTrigger context="ics25" />
      <ICS25ClientContent />
      <Footer />
    </div>
  );
}
