import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Meditron | Creator Command Center",
  description:
    "Meditron Command Center ",
  keywords:
    "Meditron Command Center",
  openGraph: {
    title: "Meditron Command Center",
    description:
      "Meditron Command Center",
    images: [
      {
        url: "/icons/contact-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Meditron Command Center",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Meditron Command Center",
    description:
      "Meditron Command Center",
    images: ["/icons/contact-twitter-image.jpg"],
  },
  
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}