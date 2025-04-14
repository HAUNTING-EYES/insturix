import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shield | Creator Command Center",
  description:
    "Shield Command Center ",
  keywords:
    "Shield Command Center",
  openGraph: {
    title: "Shield Command Center",
    description:
      "Shield Command Center",
    images: [
      {
        url: "/icons/contact-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Shield Command Center",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Shield Command Center",
    description:
      "Shield Command Center",
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