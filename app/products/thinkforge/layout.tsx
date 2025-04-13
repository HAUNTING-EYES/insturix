import { Metadata } from "next";

export const metadata: Metadata = {
  title: "ThinkForge | AI Content Generation",
  description: "Advanced AI-powered content generation platform for creators, helping produce high-quality scripts, captions, and ideas tailored to your unique voice and audience.",
  keywords: "AI content generation, script writing, content ideas, caption generator, Insturix ThinkForge",
  openGraph: {
    title: "ThinkForge | AI Content Generation",
    description: "Advanced AI-powered content generation platform for creators, helping produce high-quality scripts, captions, and ideas tailored to your unique voice and audience.",
    images: [
      {
        url: "/icons/products/thinkforge-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix ThinkForge - AI Content Generation",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ThinkForge | AI Content Generation",
    description: "Advanced AI-powered content generation platform for creators, helping produce high-quality scripts, captions, and ideas tailored to your unique voice and audience.",
    images: ["/icons/products/thinkforge-twitter-image.jpg"],
  },
};

export default function ThinkForgeLayout({
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