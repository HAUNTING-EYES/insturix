import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { ShowcasePage } from "@/components/shared/showcase-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Showcase | Insturix",
  description: "See what businesses produce with Insturix. Real examples across industries.",
};

export default function Showcase() {
  return (<><SiteNavbar /><ShowcasePage /><SiteFooter /></>);
}
