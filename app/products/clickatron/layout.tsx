import { Metadata } from "next";
import type { ReactNode } from "react";
import { getBaseUrl } from "@/lib/env";

const TITLE = "Clickatron | AI Thumbnail Generator & Editor";
const DESCRIPTION =
  "Design scroll-stopping thumbnails with Clickatron's AI-powered prompt optimization, high-fidelity renders, and Insturix workflow automation.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "Clickatron",
    "AI thumbnails",
    "Insturix",
    "AI",
    "Render pipeline",
    "creative workflow",
    "image editor",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${getBaseUrl()}/products/clickatron`,
    type: "website",
    images: [
      {
        url: "/icons/products/clickatron-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Clickatron by Insturix - AI Thumbnail Generator",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/icons/products/clickatron-twitter-image.jpg"],
  },
};

export default function ClickatronLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
