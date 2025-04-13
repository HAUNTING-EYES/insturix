import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sponsor | Partner With Creators",
  description: "Connect your brand with authentic content creators who align with your values and audience. Build meaningful partnerships that drive engagement and conversions.",
  keywords: "sponsor creators, brand partnerships, influencer collaborations, content marketing, Insturix sponsors",
  openGraph: {
    title: "Sponsor | Partner With Creators",
    description: "Connect your brand with authentic content creators who align with your values and audience. Build meaningful partnerships that drive engagement and conversions.",
    images: [
      {
        url: "/icons/sponsor-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix Sponsor - Partner With Creators",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sponsor | Partner With Creators",
    description: "Connect your brand with authentic content creators who align with your values and audience. Build meaningful partnerships that drive engagement and conversions.",
    images: ["/icons/sponsor-twitter-image.jpg"],
  },
};

export default function SponsorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
} 