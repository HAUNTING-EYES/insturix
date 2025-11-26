import { Metadata } from "next";
import dynamic from "next/dynamic";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import WhoWeAre from "@/components/WhoWeAre";
import { WhyUs } from "@/components/WhyUs";
import BentoGrid from "@/components/Home/BentoGrid";
import Script from "next/script";
import { Suspense } from "react";
import { LoadingScreen } from "@/components/Loader/LoadingScreen";

// Dynamically import client components
const ClientHeroSection = dynamic(() => import("@/components/Home/HeroSection"), { ssr: true });
import ProgressBarWrapper from "@/components/ProgressBarWrapper";

export const metadata: Metadata = {
  title: "Insturix | Building Future, Together",
  description: "Your all-in-one platform for creator protection, AI-powered tools, and brand collaborations.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Insturix | Building Future, Together",
    description: "Your all-in-one platform for creator protection, AI-powered tools, and brand collaborations.",
    images: [
      {
        url: "/icons/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix - Building Future, Together",
      },
    ],
  },
};

export default function Home() {
  // Organization structured data for rich search results
  const organizationStructuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Insturix",
    url: process.env.SITE_URL,
    logo: `${process.env.SITE_URL}/icons/logo.png`,
    description: "Your all-in-one platform for creator protection, AI-powered tools, and brand collaborations.",
    sameAs: [
      "https://twitter.com/insturix",
      "https://www.linkedin.com/company/insturix",
      "https://www.instagram.com/insturix"
    ],
    contactPoint: {
      "@type": "ContactPoint",
      email: "contact@insturix.com",
      contactType: "customer service"
    },
    // Product categories
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Insturix Products",
      itemListElement: [
        {
          "@type": "Product",
          name: "AI Video Editor",
          description: "AI-powered video editing tools for content creators",
          url: `${process.env.SITE_URL}/products/ai-video-editor`
        },
        {
          "@type": "Product",
          name: "Influencer Protection",
          description: "Digital insurance and protection for influencers",
          url: `${process.env.SITE_URL}/products/influencer-protection`
        },
        {
          "@type": "Product",
          name: "Business Analytics",
          description: "AI-driven insights for content creators",
          url: `${process.env.SITE_URL}/products/business-analytics`
        }
      ]
    }
  };

  // WebSite structured data for enhanced search appearance
  const websiteStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Insturix",
    url: process.env.SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${process.env.SITE_URL}/search?q={search_term_string}`
      },
      "query-input": "required name=search_term_string"
    }
  };

  return (
    <div className="relative w-full bg-neutral-950">
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
      <Suspense fallback={<LoadingScreen />}>
        <ClientHeroSection />
      </Suspense>
      <div id="features">
        <BentoGrid />
      </div>
      <WhoWeAre />
      <WhyUs />
      {/* <Testimo /> */}
      <Footer />
    </div>
  );
}
