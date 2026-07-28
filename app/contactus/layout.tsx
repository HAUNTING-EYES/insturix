import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Insturix | Talk to Sales or Support",
  description:
    "Contact Insturix for sales, support, business inquiries, or help with automated content production workflows.",
  keywords: [
    "contact Insturix",
    "Insturix support",
    "Insturix sales",
    "automated content production platform support",
    "AI content production support",
    "business inquiries Insturix",
  ],
  openGraph: {
    siteName: "Insturix",
    title: "Contact Insturix | Talk to Sales or Support",
    description:
      "Reach the Insturix team for sales, support, business inquiries, or help with content production workflows.",
    images: [
      {
        url: "/icons/contact-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Contact Insturix - Get in Touch",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact Insturix | Talk to Sales or Support",
    description:
      "Contact Insturix for sales, support, and business inquiries.",
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
