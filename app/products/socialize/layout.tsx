import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Socialize | Brand Deals Platform",
  description: "Connect content creators with brands for authentic partnerships and collaborations, streamlining the entire process from discovery to payment.",
  keywords: "brand deals, influencer marketing, creator partnerships, sponsored content, Insturix Socialize",
  openGraph: {
    title: "Socialize | Brand Deals Platform",
    description: "Connect content creators with brands for authentic partnerships and collaborations, streamlining the entire process from discovery to payment.",
    images: [
      {
        url: "/icons/products/socialize-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix Socialize - Brand Deals Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Socialize | Brand Deals Platform",
    description: "Connect content creators with brands for authentic partnerships and collaborations, streamlining the entire process from discovery to payment.",
    images: ["/icons/products/socialize-twitter-image.jpg"],
  },
};

export default function SocializeLayout({
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