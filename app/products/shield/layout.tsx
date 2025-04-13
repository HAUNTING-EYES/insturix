import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shield | Influencer Protection",
  description: "Comprehensive digital insurance and protection service designed specifically for content creators and influencers to safeguard their online presence and livelihoods.",
  keywords: "influencer protection, content creator insurance, digital asset protection, online brand safety, Insturix Shield",
  openGraph: {
    title: "Shield | Influencer Protection",
    description: "Comprehensive digital insurance and protection service designed specifically for content creators and influencers to safeguard their online presence and livelihoods.",
    images: [
      {
        url: "/icons/products/shield-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix Shield - Influencer Protection",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Shield | Influencer Protection",
    description: "Comprehensive digital insurance and protection service designed specifically for content creators and influencers to safeguard their online presence and livelihoods.",
    images: ["/icons/products/shield-twitter-image.jpg"],
  },
};

export default function ShieldLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
    </>
  );
} 