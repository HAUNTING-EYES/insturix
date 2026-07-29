import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { SupportCredits } from "@/components/shared/support-us/support-credits";
import type { Metadata } from "next";

// This route is in the sitemap but declared no metadata at all, so it inherited the
// root layout's and served the HOMEPAGE's title and description in search results.
export const metadata: Metadata = {
  alternates: { canonical: "/support-us" },
  title: "Support Us",
  description:
    "Support Insturix and help us keep building an automated content production platform for agencies, in-house teams, creator houses, and filmmakers.",
  // Declared here rather than inherited: the root layout can only carry ONE absolute
  // og:url, and inheriting it made this page advertise itself as the homepage.
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/support-us",
    siteName: "Insturix",
    title: "Support Us | Insturix",
    description:
      "Support Insturix and help us keep building an automated content production platform for agencies, in-house teams, creator houses, and filmmakers.",
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

export default function SupportUs() {
  return (
    <>
      <SiteNavbar />
      <SupportCredits />
      <SiteFooter />
    </>
  );
}
