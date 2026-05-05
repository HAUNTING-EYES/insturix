import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { PricingDrain } from "@/components/shared/pricing/pricing-drain";

export default function UpgradeC() {
  return (
    <>
      <SiteNavbar />
      <PricingDrain />
      <SiteFooter />
    </>
  );
}
