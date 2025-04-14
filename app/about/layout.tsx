import { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Insturix | Revolutionizing Creator & Brand Ecosystems",
  description: "Insturix is an AI-driven platform transforming content creation, influencer marketing, and business collaboration. Learn more about our mission, vision, and innovative products.",
  keywords: "about Insturix, AI-powered creator tools, influencer marketing platform, AI content creation, creator-business platform, Insturix company, about Insturix vision",
  openGraph: {
    title: "About Insturix | Revolutionizing Creator & Brand Ecosystems",
    description: "Discover Insturix's mission to empower creators and businesses with AI-powered tools for smarter content creation, brand partnerships, and influencer marketing.",
    images: [
      {
        url: "/icons/products/insturix-about-us-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix - AI for Creators and Brands",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "About Insturix | Revolutionizing Creator & Brand Ecosystems",
    description: "Learn about Insturix, the AI-driven platform shaping the future of content creation, influencer marketing, and brand collaborations.",
    images: ["/icons/products/insturix-about-us-twitter-image.jpg"],
  },
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
