import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Musitron | AI Music Generator",
  description: "Innovative AI Music generation platform for creators to produce royalty-free and copyright-free music, sound effects that enhance video content and audience engagement.",
  keywords: "AI Music generation, royalty-free music, sound effects, Insturix Musitron , Copyright-free Music content creation tools",
  openGraph: {
    title: "Musitron | AI Music Generator",
    description: "Innovative AI Music generation platform for creators to produce royalty-free and copyright-free music, sound effects that enhance video content and audience engagement.",
    images: [
      {
        url: "/icons/products/musitron-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix Musitron - AI Music Generator",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Musitron | AI Music Generator",
    description: "Innovative AI Music generation platform for creators to produce royalty-free and copyright-free music, sound effects that enhance video content and audience engagement.",
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