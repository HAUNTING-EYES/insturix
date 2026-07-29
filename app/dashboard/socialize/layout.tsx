import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Socialize | Creator Command Center",
  description:
    "Socialize Command Center ",
  keywords:
    "Socialize Command Center",
  openGraph: {
    title: "Socialize Command Center",
    description:
      "Socialize Command Center",
    images: [
      {
        url: "/icons/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Socialize Command Center",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Socialize Command Center",
    description:
      "Socialize Command Center",
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