import { Metadata } from "next";
import Script from "next/script";
import { getBaseUrl } from "@/lib/env";
import { LandingKinetic } from "@/components/landing-kinetic/landing-page-kinetic";

export const metadata: Metadata = {
  title: "Insturix | Automated Content Production Platform",
  description:
    "Insturix is an automated content production platform for agencies, in-house teams, businesses, enterprises, creator houses, and filmmakers.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    siteName: "Insturix",
    title: "Insturix | Automated Content Production Platform",
    description:
      "Plan, script, edit, analyze, design, add sound, publish, and share content from one automated production workflow.",
    images: [
      {
        url: "/icons/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix automated content production platform",
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
      "Insturix is an automated content production platform for agencies, in-house teams, businesses, enterprises, creator houses, and filmmakers.",
    sameAs: [
      "https://twitter.com/insturix",
      "https://www.linkedin.com/company/insturix",
      "https://www.instagram.com/insturix",
    ],
  };

  const softwareStructuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Insturix",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: getBaseUrl(),
    description:
      "Automated content production software for planning, scripting, editing uploaded footage, analyzing drafts, creating visual assets, adding music and sound, publishing media, and keeping outputs on brand.",
    audience: {
      "@type": "Audience",
      audienceType:
        "Agencies, in-house teams, businesses, enterprises, creator houses, and filmmakers",
    },
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
        id="software-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareStructuredData),
        }}
      />
      <Script
        id="website-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteStructuredData),
        }}
      />
      {/* Home swapped to the founder-finalized kinetic landing — it ships its own fixed nav
          and footer, so SiteNavbar/LandingPageA are no longer rendered here. The SEO JSON-LD
          scripts above are preserved. Was: <SiteNavbar /> + <LandingPageA /> marketing scroll. */}
      <LandingKinetic />
    </>
  );
}
