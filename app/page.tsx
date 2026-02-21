import { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import Script from "next/script";
import { Suspense } from "react";
import { LoadingScreen } from "@/components/Loader/LoadingScreen";
import { getBaseUrl } from "@/lib/env";
import ProgressBarWrapper from "@/components/ProgressBarWrapper";

import HeroStatement from "@/components/Home/HeroStatement";
import ProductSuite from "@/components/Home/ProductSuite";
import IntelligenceLayer from "@/components/Home/IntelligenceLayer";
import PricingPreview from "@/components/Home/PricingPreview";
import AgencyPreview from "@/components/Home/AgencyPreview";
import ClosingCTA from "@/components/Home/ClosingCTA";

export const metadata: Metadata = {
  title: "Insturix | The Operating System for Content Production",
  description: "Edit, analyze, generate, and distribute your content with AI that learns your brand. Seven tools, one ecosystem.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Insturix | The Operating System for Content Production",
    description: "Edit, analyze, generate, and distribute your content with AI that learns your brand. Seven tools, one ecosystem.",
    images: [
      {
        url: "/icons/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix - Content Production Ecosystem",
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
    description: "Your all-in-one platform for AI-powered content production.",
    sameAs: [
      "https://twitter.com/insturix",
      "https://www.linkedin.com/company/insturix",
      "https://www.instagram.com/insturix"
    ]
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
        urlTemplate: `${getBaseUrl()}/search?q={search_term_string}`
      },
      "query-input": "required name=search_term_string"
    }
  };

  return (
    <div className="relative w-full bg-zinc-950 selection:bg-zinc-800 selection:text-white">
      <Script 
        id="organization-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationStructuredData) }}
      />
      <Script 
        id="website-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteStructuredData) }}
      />
      <ProgressBarWrapper />
      <Navbar />
      
      <main>
        <Suspense fallback={<LoadingScreen />}>
          <HeroStatement />
        </Suspense>
        <ProductSuite />
        <IntelligenceLayer />
        <AgencyPreview />
        <div className="h-px w-full bg-zinc-800" />
        <PricingPreview />
        <div className="h-px w-full bg-zinc-800" />
        <ClosingCTA />
      </main>

      <Footer />
    </div>
  );
}
