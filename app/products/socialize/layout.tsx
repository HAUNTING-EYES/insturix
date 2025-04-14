import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Socialize | Smart Link-in-Bio for Creators",
  description: "Socialize by Insturix is an AI-powered link-in-bio platform that helps creators showcase all their content, brand deals, and social links in one customizable hub.",
  keywords: "link in bio, creator tools, content hub, smart bio link, Insturix Socialize, influencer tools, social media hub, creator growth",
  openGraph: {
    title: "Socialize | Smart Link-in-Bio for Creators",
    description: "Create your own AI-powered content hub with Socialize. Showcase your links, brand deals, and track performance—all from one powerful link-in-bio tool.",
    images: [
      {
        url: "/icons/products/socialize-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix Socialize - Link in Bio Platform for Creators",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Socialize | Smart Link-in-Bio for Creators",
    description: "Socialize is the ultimate AI link-in-bio tool for creators. Share your content, brand deals, and track engagement effortlessly.",
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