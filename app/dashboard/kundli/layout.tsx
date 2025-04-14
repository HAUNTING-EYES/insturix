import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kundli | Creator Command Center",
  description:
    "Kundli Command Center ",
  keywords:
    "Kundli Command Center",
  openGraph: {
    title: "Kundli Command Center",
    description:
      "Kundli Command Center",
    images: [
      {
        url: "/icons/contact-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Kundli Command Center",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kundli Command Center",
    description:
      "Kundli Command Center",
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