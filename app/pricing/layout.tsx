import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing | Plans & Packages",
  description: "Explore our flexible pricing plans designed to meet the needs of content creators at every stage of their journey, from beginners to established professionals.",
  keywords: "Insturix pricing, creator tools plans, subscription packages, AI tools pricing, content creator services",
  openGraph: {
    title: "Pricing | Plans & Packages",
    description: "Explore our flexible pricing plans designed to meet the needs of content creators at every stage of their journey, from beginners to established professionals.",
    images: [
      {
        url: "/icons/pricing-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix Pricing - Plans & Packages",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing | Plans & Packages",
    description: "Explore our flexible pricing plans designed to meet the needs of content creators at every stage of their journey, from beginners to established professionals.",
    images: ["/icons/pricing-twitter-image.jpg"],
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
} 