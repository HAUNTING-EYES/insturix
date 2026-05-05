import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { PricingBadge } from "@/components/shared/pricing/pricing-badge";

export default function UpgradeB() {
  return (
    <>
      <SiteNavbar />
      <PricingBadge />
      <SiteFooter />
    </>
  );
}
