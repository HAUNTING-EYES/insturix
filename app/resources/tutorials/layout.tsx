import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tutorials | Learn Automated Content Production",
  description:
    "Step-by-step Insturix tutorials for planning, scripting, editing uploaded footage, setting up brand profiles, and publishing finished content.",
  keywords: [
    "Insturix tutorials",
    "automated content production tutorials",
    "AI content workflow tutorials",
    "edit uploaded footage with AI",
    "content production workflow guide",
  ],
  openGraph: {
    siteName: "Insturix",
    title: "Insturix Tutorials | Learn Automated Content Production",
    description:
      "Guides for planning, scripting, editing, brand profiles, publishing, and content production workflows in Insturix.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Insturix Tutorials | Learn Automated Content Production",
    description:
      "Step-by-step guides for using Insturix content production workflows.",
  },
};

export default function TutorialsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
