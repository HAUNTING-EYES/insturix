import type { Metadata } from "next";
import { LandingPageA } from "@/components/landing-a/landing-page-a";

export const metadata: Metadata = {
  title: "Insturix | One platform. Entire production.",
  description:
    "Replace your entire video production workflow. Script, edit, analyze, and publish — from a single prompt. Built for agencies producing content at scale.",
  openGraph: {
    title: "Insturix | One platform. Entire production.",
    description:
      "Replace your entire video production workflow. Script, edit, analyze, and publish — from a single prompt.",
    images: [{ url: "/icons/og-image.jpg", width: 1200, height: 630 }],
  },
};

export default function LandingAPage() {
  return <LandingPageA />;
}
