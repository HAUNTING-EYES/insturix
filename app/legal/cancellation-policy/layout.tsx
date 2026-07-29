import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cancellation Policy | Insturix",
  description:
    "Read our Cancellation Policy to understand how cancellations are handled for Insturix's digital services and subscriptions.",
  keywords:
    "Cancellation Policy Insturix, Insturix cancellation, Insturix subscription cancellation",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/legal/cancellation-policy",
    siteName: "Insturix",
    title: "Cancellation Policy | Insturix",
    description:
      "Read our Cancellation Policy to understand how cancellations are handled for Insturix's digital services and subscriptions.",
    images: [
      {
        url: "/icons/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Cancellation Policy Insturix",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cancellation Policy | Insturix",
    description:
      "Read our Cancellation Policy to understand how cancellations are handled for Insturix's digital services and subscriptions.",
    images: ["/icons/twitter-image.jpg"],
  },
};

export default function CancellationPolicyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
} 