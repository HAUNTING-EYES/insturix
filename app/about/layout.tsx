import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Insturix | Automated Content Production Platform",
  description:
    "Learn about Insturix, the automated content production platform for agencies, in-house teams, businesses, enterprises, creator houses, and filmmakers.",
  keywords: [
    "about Insturix",
    "automated content production platform",
    "AI content production platform",
    "content production automation",
    "content production company",
    "AI content workflow",
  ],
  openGraph: {
    title: "About Insturix | Automated Content Production Platform",
    description:
      "Insturix helps agencies, in-house teams, businesses, enterprises, creator houses, and filmmakers automate content production workflows.",
    images: [
      {
        url: "/icons/products/insturix-about-us-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix - Automated Content Production Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "About Insturix | Automated Content Production Platform",
    description:
      "Learn about Insturix, the automated content production platform for modern content teams.",
    images: ["/icons/products/insturix-about-us-twitter-image.jpg"],
  },
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
