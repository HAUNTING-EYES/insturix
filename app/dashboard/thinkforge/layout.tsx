import { Metadata } from "next";
import "./thinkforge.css";

export const metadata: Metadata = {
  title: "Script | Creator Command Center",
  description:
    "Script Command Center ",
  keywords:
    "Script Command Center",
  openGraph: {
    title: "Script Command Center",
    description:
      "Script Command Center",
    images: [
      {
        url: "/icons/contact-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Script Command Center",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Script Command Center",
    description:
      "Script Command Center",
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