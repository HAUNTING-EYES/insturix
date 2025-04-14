import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Alyzitron | Creator Command Center",
  description:
    "Alyzitron Command Center ",
  keywords:
    "Alyzitron Command Center",
  openGraph: {
    title: "Alyzitron Command Center",
    description:
      "Alyzitron Command Center",
    images: [
      {
        url: "/icons/contact-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Alyzitron Command Center",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Alyzitron Command Center",
    description:
      "Alyzitron Command Center",
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