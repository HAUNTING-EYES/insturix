import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { AboutPage } from "@/components/shared/about-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "Insturix is an automated content production platform for agencies, in-house teams, and creator houses. Learn what we build, why, and who is behind it.",
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
