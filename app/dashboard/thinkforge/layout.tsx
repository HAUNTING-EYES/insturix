import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Thinkforge | Creator Command Center",
  description:
    "Thinkforge Command Center ",
  keywords:
    "Thinkforge Command Center",
  openGraph: {
    title: "Thinkforge Command Center",
    description:
      "Thinkforge Command Center",
    images: [
      {
        url: "/icons/contact-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Thinkforge Command Center",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Thinkforge Command Center",
    description:
      "Thinkforge Command Center",
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