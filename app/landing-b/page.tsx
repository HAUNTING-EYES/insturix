import type { Metadata } from "next";
import { LandingPage } from "@/components/landing-b/landing-page";

export const metadata: Metadata = {
  title: "Insturix | One prompt. Entire production.",
  description:
    "Replace your entire video production workflow. Script, edit, analyze, and publish — from a single prompt. Built for agencies producing content at scale.",
  openGraph: {
    title: "Insturix | One prompt. Entire production.",
    description:
      "Replace your entire video production workflow. Script, edit, analyze, and publish — from a single prompt.",
    images: [{ url: "/icons/og-image.jpg", width: 1200, height: 630 }],
  },
};

export default function LandingBPage() {
  return <LandingPage />;
}
