import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up | Start Producing Content with Insturix",
  description: "Create an Insturix account to plan, edit, analyze, publish, and manage brand-consistent content from one automated production workflow.",
  keywords: "Insturix signup, automated content production account, AI content workflow signup, content production platform account",
  // Auth page — not an SEO landing page. Keep it out of the index (2026-07-01).
  robots: { index: false, follow: false },
  openGraph: {
    title: "Sign Up | Start Producing Content with Insturix",
    description: "Create an Insturix account for automated content production workflows across planning, editing, analysis, publishing, and brand consistency.",
    images: [
      {
        url: "/icons/signup-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix signup for automated content production",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sign Up | Start Producing Content with Insturix",
    description: "Create an Insturix account for automated content production workflows and brand-consistent output.",
    images: ["/icons/signup-twitter-image.jpg"],
  },
};

export default function SignUpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
