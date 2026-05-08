import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { AboutPage } from "@/components/shared/about-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About | Insturix",
  description:
    "Building the operating system for content production. Meet the team behind Insturix.",
};

export default function About() {
  return (
    <>
      <SiteNavbar />
      <AboutPage />
      <SiteFooter />
    </>
  );
}
