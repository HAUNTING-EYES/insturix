import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Insturix Blog | Automated Content Production Insights",
  description:
    "Guides and insights on automated content production, AI content workflows, brand consistency, and scaling content output for teams and agencies.",
  keywords:
    "automated content production, AI content workflow, content production automation, brand-consistent content, Insturix blog",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/resources/blogs",
    siteName: "Insturix",
    title: "Insturix Blog | Automated Content Production Insights",
    description:
      "Guides and insights on AI-assisted content workflows, brand consistency, and scaling production output.",
    images: [
      {
        url: "/icons/blog-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix blog for automated content production",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Insturix Blog | Automated Content Production Insights",
    description:
      "Guides and insights on AI-assisted content workflows, brand consistency, and scaling production output.",
    images: ["/icons/blog-twitter-image.jpg"],
  },
};

export default function BlogsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
