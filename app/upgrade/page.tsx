import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { PricingPage } from "@/components/shared/pricing-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/upgrade" },
  title: "Pricing & Plans",
  description:
    "Insturix pricing and plans for automated content production. Compare what each plan includes for individual creators, teams, and agencies. Start free.",
  // Declared here rather than inherited: the root layout can only carry ONE absolute
  // og:url, and inheriting it made this page advertise itself as the homepage.
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/upgrade",
    siteName: "Insturix",
    title: "Pricing & Plans | Insturix",
    description:
      "Insturix pricing and plans for automated content production. Compare what each plan includes for individual creators, teams, and agencies. Start free.",
    images: [
      {
        url: "/icons/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix - Automated Content Production Platform",
      },
    ],
  },
};

export default function Upgrade() {
  return (
    <>
      <SiteNavbar />
      <PricingPage />
      <SiteFooter />
    </>
  );
}
