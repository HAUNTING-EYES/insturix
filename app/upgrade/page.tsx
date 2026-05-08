import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { PricingPage } from "@/components/shared/pricing-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing | Insturix",
  description: "Simple pricing for powerful content production tools. Start free, scale as you grow.",
};

export default function Upgrade() {
  return (
    <>
      <SiteNavbar />
      <PricingPage />
      <SiteFooter />
    </>
  );
}
