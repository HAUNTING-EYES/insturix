import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { PricingPage } from "@/components/shared/pricing-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing & Plans",
  description:
    "Insturix pricing and plans for automated content production. Compare what each plan includes for individual creators, teams, and agencies. Start free.",
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
