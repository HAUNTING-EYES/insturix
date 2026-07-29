import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { ShowcasePage } from "@/components/shared/showcase-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/showcase" },
  title: "Showcase",
  description:
    "See real work produced with Insturix, the automated content production platform. Browse examples across formats, industries, and brand styles.",
  // Declared here rather than inherited: the root layout can only carry ONE absolute
  // og:url, and inheriting it made this page advertise itself as the homepage.
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/showcase",
    siteName: "Insturix",
    title: "Showcase | Insturix",
    description:
      "See real work produced with Insturix, the automated content production platform. Browse examples across formats, industries, and brand styles.",
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

export default function Showcase() {
  return (<><SiteNavbar /><ShowcasePage /><SiteFooter /></>);
}
