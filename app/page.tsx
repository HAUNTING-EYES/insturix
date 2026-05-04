import { Metadata } from "next";
import Script from "next/script";
import { getBaseUrl } from "@/lib/env";
import { SiteNavbar } from "@/components/shared/site-navbar";
import { LandingPageA } from "@/components/landing-a/landing-page-a";

export const metadata: Metadata = {
  title: "Insturix | One prompt. Entire production.",
  description:
    "Replace your entire video production workflow. Script, edit, analyze, and publish — from a single prompt. Built for agencies producing content at scale.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Insturix | One prompt. Entire production.",
    description:
      "Replace your entire video production workflow. Script, edit, analyze, and publish — from a single prompt.",
    images: [
      {
        url: "/icons/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix — One prompt. Entire production.",
      },
    ],
  },
};

export default function Home() {
  const organizationStructuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Insturix",
    url: getBaseUrl(),
    logo: `${getBaseUrl()}/icons/logo.png`,
    description:
      "Replace your entire video production workflow with AI. Script, edit, analyze, and publish from a single prompt.",
    sameAs: [
      "https://twitter.com/insturix",
      "https://www.linkedin.com/company/insturix",
      "https://www.instagram.com/insturix",
    ],
  };

  const websiteStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Insturix",
    url: getBaseUrl(),
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${getBaseUrl()}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <Script
        id="organization-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationStructuredData),
        }}
      />
      <Script
        id="website-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteStructuredData),
        }}
      />
      <SiteNavbar />
      <LandingPageA />
      {/* SiteFooter is rendered inside LandingPageA's marketing scroll container */}
    </>
  );
}
