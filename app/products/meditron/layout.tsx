import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Meditron | AI Image Creator",
  description: "Powerful AI image generation tool for creators to design thumbnails, graphics, and visual content that captures audience attention and enhances brand identity.",
  keywords: "AI image generation, thumbnail creator, graphics design, visual content, Insturix Meditron",
  openGraph: {
    title: "Meditron | AI Image Creator",
    description: "Powerful AI image generation tool for creators to design thumbnails, graphics, and visual content that captures audience attention and enhances brand identity.",
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
    title: "Meditron | AI Image Creator",
    description: "Powerful AI image generation tool for creators to design thumbnails, graphics, and visual content that captures audience attention and enhances brand identity.",
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