import { Metadata } from "next";

const TITLE = "Insturix Products | Automated Content Production Platform";
const DESCRIPTION =
  "Explore Insturix products for automated content production: planning, scripting, editing, analysis, asset creation, publishing, sharing, and brand workflows.";
const PRODUCT_KEYWORDS = [
  "automated content production",
  "AI content production platform",
  "content workflow automation",
  "Insturix products",
];
const SOCIAL_IMAGE = {
  url: "/brand/insturix_black.png",
  width: 1200,
  height: 630,
  alt: "Insturix automated content production platform",
};

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: PRODUCT_KEYWORDS,
  alternates: {
    canonical: "/products",
  },
  robots: {
    index: false,
    follow: true,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/products",
    type: "website",
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [SOCIAL_IMAGE.url],
  },
};

export default function LegacyProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
