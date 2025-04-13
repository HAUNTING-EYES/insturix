import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Creator Resources | Blogs & Articles",
  description: "Explore our collection of insightful articles, guides, and tutorials designed to help content creators succeed in an ever-evolving digital landscape.",
  keywords: "creator resources, content creation guides, influencer tips, digital content strategy, Insturix blog",
  openGraph: {
    title: "Creator Resources | Blogs & Articles",
    description: "Explore our collection of insightful articles, guides, and tutorials designed to help content creators succeed in an ever-evolving digital landscape.",
    images: [
      {
        url: "/icons/blog-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix Creator Resources - Blogs & Articles",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Creator Resources | Blogs & Articles",
    description: "Explore our collection of insightful articles, guides, and tutorials designed to help content creators succeed in an ever-evolving digital landscape.",
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