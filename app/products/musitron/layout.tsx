import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Musitron | AI Audio Generator",
  description: "Innovative AI audio generation platform for creators to produce royalty-free music, sound effects, and voiceovers that enhance video content and audience engagement.",
  keywords: "AI audio generation, royalty-free music, sound effects, voiceover creator, Insturix Musitron",
  openGraph: {
    title: "Musitron | AI Audio Generator",
    description: "Innovative AI audio generation platform for creators to produce royalty-free music, sound effects, and voiceovers that enhance video content and audience engagement.",
    images: [
      {
        url: "/icons/products/musitron-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix Musitron - AI Audio Generator",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Musitron | AI Audio Generator",
    description: "Innovative AI audio generation platform for creators to produce royalty-free music, sound effects, and voiceovers that enhance video content and audience engagement.",
    images: ["/icons/products/musitron-twitter-image.jpg"],
  },
};

export default function MusitronLayout({
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