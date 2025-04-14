import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Meditron | Creator Business Marketplace",
  description: "AI-driven creator-brand matchmaking. Meditron connects influencers and businesses through smart, data-backed collaborations.",
  keywords: "AI influencer marketing ,Creator brand collaboration ,AI matchmaking platform ,Influencer-brand connect,Smart influencer marketing , Creator-brand deals, Influencer campaign tool",
  openGraph: {
    title: "Meditron | Creator Business Marketplace",
    description: "AI-driven creator-brand matchmaking. Meditron connects influencers and businesses through smart, data-backed collaborations.",
    images: [
      {
        url: "/icons/products/meditron-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix Meditron - AI Image Creator",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Meditron | Creator Business Marketplace",
    description: "AI-driven creator-brand matchmaking. Meditron connects influencers and businesses through smart, data-backed collaborations.",
    images: ["/icons/products/meditron-twitter-image.jpg"],
  },
};

export default function MeditronLayout({
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