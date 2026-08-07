import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Music | Creator Command Center",
  description:
    "Music Command Center ",
  keywords:
    "Music Command Center",
  openGraph: {
    title: "Music Command Center",
    description:
      "Music Command Center",
    images: [
      {
        url: "/icons/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Music Command Center",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Music Command Center",
    description:
      "Music Command Center",
    images: ["/icons/twitter-image.jpg"],
  },
  
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}