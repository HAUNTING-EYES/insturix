import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Editron | AI-Powered Video Editor",
  description: "Professional-grade AI video editing solution for content creators, streamlining the editing process with advanced automation and creative tools and reducing editing time by 95%.",
  keywords: "AI video editor, content creator tools, automated video editing, professional video creation, Insturix Editron",
  openGraph: {
    title: "Editron | AI-Powered Video Editor",
    description: "Professional-grade AI video editing solution for content creators, streamlining the editing process with advanced automation and creative tools and reducing editing time by 95%.",
    images: [
      {
        url: "/icons/products/editron-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix Editron - AI-Powered Video Editor",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Editron | AI-Powered Video Editor",
    description: "Professional-grade AI video editing solution for content creators, streamlining the editing process with advanced automation and creative tools and reducing editing time by 95%.",
    images: ["/icons/products/editron-twitter-image.jpg"],
  },
};

export default function EditronLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
    </>
  );
} 