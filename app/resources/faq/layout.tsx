import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Insturix FAQ | Automated Content Production Answers",
  description:
    "Answers about Insturix, automated content production workflows, uploaded footage, brand profiles, publishing, pricing, and support.",
  keywords: [
    "Insturix FAQ",
    "what is Insturix",
    "how does Insturix work",
    "automated content production FAQ",
    "AI content production platform FAQ",
    "content production workflow FAQ",
    "brand profile content production",
  ],
  openGraph: {
    siteName: "Insturix",
    title: "Insturix FAQ | Automated Content Production Answers",
    description:
      "Common questions about Insturix and its automated content production workflow for agencies, teams, businesses, filmmakers, and enterprises.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Insturix FAQ | Automated Content Production Answers",
    description:
      "Answers about Insturix, automated content production, brand profiles, pricing, publishing, and support.",
  },
};

export default function FaqLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
