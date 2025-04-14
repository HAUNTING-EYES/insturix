import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Musitron | Creator Command Center",
  description:
    "Musitron Command Center ",
  keywords:
    "Musitron Command Center",
  openGraph: {
    title: "Musitron Command Center",
    description:
      "Musitron Command Center",
    images: [
      {
        url: "/icons/contact-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Musitron Command Center",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Musitron Command Center",
    description:
      "Musitron Command Center",
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