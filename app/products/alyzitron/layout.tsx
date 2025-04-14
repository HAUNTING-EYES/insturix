import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Alyzitron | Content Analytics for Creators",
  description: "Data-driven analytics platform designed specifically for content creators to track performance, audience engagement, and monetization opportunities. Comunity Guidlines, Fact Authentication",
  keywords: "creator analytics, content performance tracking, audience insights, monetization analytics, Insturix Alyzitron,Community Guidlines Violation, Fact Authentication",
  openGraph: {
    title: "Alyzitron | Content Analytics for Creators",
    description: "Data-driven analytics platform designed specifically for content creators to track performance, audience engagement, and monetization opportunities. Comunity Guidlines, Fact Authentication",
    images: [
      {
        url: "/icons/products/alyzitron-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix Alyzitron - Content Analytics for Creators",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Alyzitron | Content Analytics for Creators",
    description: "Data-driven analytics platform designed specifically for content creators to track performance, audience engagement, and monetization opportunities. Comunity Guidlines, Fact Authentication",
    images: ["/icons/products/alyzitron-twitter-image.jpg"],
  },
};

export default function AlyzitronLayout({
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