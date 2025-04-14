import { Metadata } from "next";

export const metadata: Metadata = {
  title: "ThinkForge | AI Content Ideation & Scripting Tool",
  description: "ThinkForge by Insturix is an AI-powered tool that helps creators generate content ideas, script videos, and plan engaging posts tailored to their niche and audience.",
  keywords: "AI content ideation, video scripting tool, ThinkForge by Insturix, content creation AI, creator tools, script generator, idea generator for creators",
  openGraph: {
    title: "ThinkForge | AI Content Ideation & Scripting Tool",
    description: "Fuel your creativity with ThinkForge. Generate content ideas, write scripts, and create viral content faster with AI tailored to your audience.",
    images: [
      {
        url: "/icons/products/thinkforge-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix ThinkForge - AI Content Creation Tool and Scripting Tool",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ThinkForge | AI Content Ideation & Scripting Tool",
    description: "Create viral-worthy content with ThinkForge — the AI tool for ideation, scripting, and planning your next big post.",
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