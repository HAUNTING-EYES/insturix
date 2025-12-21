import { Metadata } from "next";
import dynamic from "next/dynamic";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { Suspense } from "react";
import { LoadingScreen } from "@/components/Loader/LoadingScreen";
import ProgressBarWrapper from "@/components/ProgressBarWrapper";

// Dynamically import client components
const EnterpriseHeroSection = dynamic(() => import("@/components/Enterprise/HeroSection"), { ssr: true });
const TrustedBy = dynamic(() => import("@/components/Enterprise/TrustedBy"), { ssr: true });
const CompanyGoals = dynamic(() => import("@/components/Enterprise/CompanyGoals"), { ssr: true });
const EnterpriseFeatures = dynamic(() => import("@/components/Enterprise/EnterpriseFeatures"), { ssr: true });
const EnterpriseBenefits = dynamic(() => import("@/components/Enterprise/EnterpriseBenefits"), { ssr: true });
const Testimonials = dynamic(() => import("@/components/Enterprise/Testimonials"), { ssr: true });
const SecurityCompliance = dynamic(() => import("@/components/Enterprise/SecurityCompliance"), { ssr: true });
const StatsSection = dynamic(() => import("@/components/Enterprise/StatsSection"), { ssr: true });
const EnterpriseCTA = dynamic(() => import("@/components/Enterprise/EnterpriseCTA"), { ssr: true });

export const metadata: Metadata = {
  title: "Insturix Enterprise | Develop Enduring Software at Scale",
  description: "Insturix helps your entire team deliver ambitious products. Enterprise-grade AI-powered tools, security, and support for the world's leading companies.",
  alternates: {
    canonical: "/enterprise",
  },
  openGraph: {
    title: "Insturix Enterprise | Develop Enduring Software at Scale",
    description: "Insturix helps your entire team deliver ambitious products. Enterprise-grade AI-powered tools, security, and support.",
    images: [
      {
        url: "/icons/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix Enterprise - Develop Enduring Software at Scale",
      },
    ],
  },
};

export default function EnterprisePage() {
  return (
    <div className="relative w-full bg-neutral-950">
      <ProgressBarWrapper />
      <Navbar />
      <Suspense fallback={<LoadingScreen />}>
        <EnterpriseHeroSection />
      </Suspense>
      <Suspense fallback={<LoadingScreen />}>
        <TrustedBy />
      </Suspense>
      <Suspense fallback={<LoadingScreen />}>
        <CompanyGoals />
      </Suspense>
      <Suspense fallback={<LoadingScreen />}>
        <EnterpriseFeatures />
      </Suspense>
      <Suspense fallback={<LoadingScreen />}>
        <EnterpriseBenefits />
      </Suspense>
      <Suspense fallback={<LoadingScreen />}>
        <Testimonials />
      </Suspense>
      <Suspense fallback={<LoadingScreen />}>
        <SecurityCompliance />
      </Suspense>
      <Suspense fallback={<LoadingScreen />}>
        <StatsSection />
      </Suspense>
      <Suspense fallback={<LoadingScreen />}>
        <EnterpriseCTA />
      </Suspense>
      <Footer />
    </div>
  );
}

