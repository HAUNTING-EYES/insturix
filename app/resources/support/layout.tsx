import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Insturix Support | Help and Troubleshooting",
  description:
    "Get help with Insturix. Find support for accounts, billing, credits, uploading footage, rendering, publishing, and automated content production workflows.",
  keywords: [
    "Insturix support",
    "Insturix help",
    "Insturix troubleshooting",
    "AI content production support",
    "automated content production help",
  ],
  openGraph: {
    siteName: "Insturix",
    title: "Insturix Support | Help and Troubleshooting",
    description:
      "Support for Insturix accounts, billing, uploads, rendering, publishing, and content production workflows.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Insturix Support | Help and Troubleshooting",
    description:
      "Get help with Insturix accounts, billing, uploads, rendering, publishing, and workflows.",
  },
};

export default function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
