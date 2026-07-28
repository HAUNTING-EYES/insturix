import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { ShowcasePage } from "@/components/shared/showcase-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Showcase | Insturix",
  description:
    "See real work produced with Insturix, the automated content production platform. Browse examples across formats, industries, and brand styles.",
};

export default function Showcase() {
  return (<><SiteNavbar /><ShowcasePage /><SiteFooter /></>);
}
