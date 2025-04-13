import { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us | Our Mission and Story",
  description: "Learn about Insturix's mission to empower content creators with innovative AI tools, protection services, and business solutions that drive success.",
  keywords: "about Insturix, creator tools company, AI innovation, content creation platform, creator empowerment",
  openGraph: {
    title: "About Us | Our Mission and Story",
    description: "Learn about Insturix's mission to empower content creators with innovative AI tools, protection services, and business solutions that drive success.",
    images: [
      {
        url: "/icons/about-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "About Insturix - Our Mission and Story",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "About Us | Our Mission and Story",
    description: "Learn about Insturix's mission to empower content creators with innovative AI tools, protection services, and business solutions that drive success.",
    images: ["/icons/about-twitter-image.jpg"],
  },
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
} 