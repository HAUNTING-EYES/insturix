import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Insturix FAQ | What It Is and How It Works",
  description:
    "Answers to common questions about Insturix, automated content production, editing uploaded footage, brand profiles, pricing, credits, and support.",
  keywords: [
    "Insturix FAQ",
    "what is Insturix",
    "how does Insturix work",
    "automated content production FAQ",
    "AI content production platform FAQ",
  ],
  openGraph: {
    title: "Insturix FAQ | What It Is and How It Works",
    description:
      "Common questions about Insturix and its automated content production workflow.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Insturix FAQ | What It Is and How It Works",
    description:
      "Answers about Insturix, automated content production, pricing, credits, and support.",
  },
};

export default function FaqLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
