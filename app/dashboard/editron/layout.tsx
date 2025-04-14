import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Editron | Creator Command Center",
  description:
    "Editron Command Center ",
  keywords:
    "Editron Command Center",
  openGraph: {
    title: "Editron Command Center",
    description:
      "Editron Command Center",
    images: [
      {
        url: "/icons/contact-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Editron Command Center",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Editron Command Center",
    description:
      "Editron Command Center",
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