import { Metadata } from "next";
import Script from "next/script";
import RegisterForm from "@/components/ics25/RegisterForm";
import CursorEffect from "@/components/ui/CursorEffect";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PopupTrigger from "@/components/ics25/PopupTrigger";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { registerBreadcrumbSchema } from "@/lib/seo/ics25-schema";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://insturix.com";

export const metadata: Metadata = {
  title: "Register for GameOn Esports Tournament at ICS'25 — Valorant & BGMI | Insturix",
  description:
    "Register your team for GameOn esports tournaments at ICS'25. Compete in Valorant (5v5) and BGMI (4v4) with ₹25,000 prize pool. Online qualifiers + live finals at IIIT Delhi. Entry fee: ₹500 per player.",
  keywords: [
    "GameOn esports tournament registration ICS25",
    "register for Valorant 5v5 tournament Delhi",
    "BGMI 4v4 esports tournament registration",
    "gaming tournament ICS25 Delhi",
    "esports competition Valorant BGMI",
    "GameOn tournament registration India",
    "esports team registration ICS25",
    "gaming tournament entry fee India",
    "esports qualifiers ICS25 Delhi",
    "Valorant BGMI tournament prize pool",
  ],
  alternates: {
    canonical: "/ics25/register",
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: `${SITE_URL}/ics25/register`,
    title: "Register for GameOn Esports Tournament at ICS'25",
    description:
      "Join GameOn esports tournaments at ICS'25 — compete in Valorant & BGMI with ₹25,000 prize pool. Register your team now!",
    siteName: "Insturix",
    images: [
      {
        url: "/ics25/gameon3.png",
        width: 1200,
        height: 630,
        alt: "GameOn Esports Tournament at ICS'25 - Register Now",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@insturix",
    creator: "@insturix",
    title: "Register for GameOn Esports Tournament — ICS'25",
    description: "Valorant 5v5 & BGMI 4v4 tournaments. Register your team. ₹25,000 prize pool!",
    images: ["/ics25/gameon3.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function Page() {
  // Block unauthenticated users from accessing registration
  // Requires sign-in before proceeding to the form
  const { userId } = await auth();
  if (!userId) {
    redirect("/signin");
  }
  // If the player is already registered, redirect them straight to the portal
  try {
    // Use a relative URL so Next.js forwards cookies in SSR and Clerk can identify the user
    const res = await fetch('/api/ics25/players/me', { cache: 'no-store', headers: { 'accept': 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      if (data?.player) {
        redirect("/ics25/my");
      }
    }
    // If 401 or no player found, fall through to show registration form
  } catch {
    // On network or env issues, continue rendering the page
  }
  return (
    <div className="relative min-h-screen overflow-hidden bg-white dark:bg-zinc-950">
      {/* Structured Data for SEO */}
      <Script
        id="register-breadcrumb-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(registerBreadcrumbSchema) }}
      />
      <div className="relative z-20">
        <Navbar />
      </div>
      <PopupTrigger context="register" />
      {/* Backdrop consistent with ICS25 page */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950" />
        <div className="absolute inset-0">
          <div className="absolute -top-24 -right-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-sky-500/15 via-transparent to-fuchsia-500/15 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-purple-500/15 via-transparent to-cyan-500/15 blur-3xl" />
        </div>
        <div className="absolute inset-0 bg-gradient-radial from-white/50 via-transparent to-transparent dark:from-zinc-800/40" />
      </div>

      <CursorEffect variant="glow" color="rgba(59, 130, 246, 0.09)" size={900} blur={180} />

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-16">
        <h1 className="text-center text-3xl md:text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100 mb-3">
          ICS’25 Gaming Tournament
        </h1>
        <p className="text-center text-zinc-600 dark:text-zinc-400 mb-10 text-lg">
          Register individually for Valorant or BGMI. Create your own team or request to join one. Entry fee: ₹500 per player.
        </p>
        <RegisterForm />
      </div>
      <div className="relative z-20">
        <Footer />
      </div>
    </div>
  );
}
