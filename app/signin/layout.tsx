import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Insturix Workspace",
  description: "Sign in to Insturix to continue automated content production workflows for planning, editing, analysis, publishing, and brand consistency.",
  keywords: "Insturix login, Insturix sign in, automated content production login, AI content workflow account",
  // Auth page — not an SEO landing page. Keep it out of the index (2026-07-01).
  robots: { index: false, follow: false },
  openGraph: {
    title: "Sign In | Insturix Workspace",
    description: "Sign in to access your Insturix content production workspace.",
    images: [
      {
        url: "/icons/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix sign in workspace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sign In | Insturix Workspace",
    description: "Sign in to continue automated content production with Insturix.",
    images: ["/icons/twitter-image.jpg"],
  },
};

export default function SignInLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
