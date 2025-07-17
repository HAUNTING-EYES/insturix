import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cancellation & Refund Policy | Insturix",
  description:
    "Read our Cancellation and Refund Policy to understand how cancellations and refunds are handled for Insturix's digital services and subscriptions.",
  keywords:
    "Cancellation Policy Insturix, Insturix refund, Insturix cancellation, Insturix refund policy, Insturix subscription cancellation",
  openGraph: {
    title: "Cancellation & Refund Policy | Insturix",
    description:
      "Read our Cancellation and Refund Policy to understand how cancellations and refunds are handled for Insturix's digital services and subscriptions.",
    images: [
      {
        url: "/icons/contact-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Cancellation & Refund Policy Insturix",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cancellation & Refund Policy | Insturix",
    description:
      "Read our Cancellation and Refund Policy to understand how cancellations and refunds are handled for Insturix's digital services and subscriptions.",
    images: ["/icons/terms-twitter-image.jpg"],
  },
};

export default function CancellationPolicyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
} 