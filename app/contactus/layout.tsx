import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us | Get in Touch",
  description:
    "Have questions about our products or services? Reach out to the Insturix team for support, partnership inquiries, or general information.",
  keywords:
    "Contact Insturix , Get in touch with Insturix , Insturix support ,Contact creator services , Reach out to Insturix team , Insturix customer support ,Contact for partnerships , Creator inquiries , Business inquiries Insturix , Support for Insturix products",
  openGraph: {
    title: "Contact Us | Get in Touch",
    description:
      "Have questions about our products or services? Reach out to the Insturix team for support, partnership inquiries, or general information.",
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
    title: "Contact Us | Get in Touch",
    description:
      "Have questions about our products or services? Reach out to the Insturix team for support, partnership inquiries, or general information.",
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