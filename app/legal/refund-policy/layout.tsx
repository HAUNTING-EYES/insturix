import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy | Insturix",
  description:
    "Read our Refund Policy to understand how refunds are handled for Insturix's digital services and subscriptions.",
  keywords:
    "Refund Policy Insturix, Insturix refund, Insturix refund policy, Insturix subscription refund",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/legal/refund-policy",
    siteName: "Insturix",
    title: "Refund Policy | Insturix",
    description:
      "Read our Refund Policy to understand how refunds are handled for Insturix's digital services and subscriptions.",
    images: [
      {
        url: "/icons/contact-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Refund Policy Insturix",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Refund Policy | Insturix",
    description:
      "Read our Refund Policy to understand how refunds are handled for Insturix's digital services and subscriptions.",
    images: ["/icons/terms-twitter-image.jpg"],
  },
};

export default function RefundPolicyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
} 