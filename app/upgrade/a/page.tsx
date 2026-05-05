import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { PricingReceipt } from "@/components/shared/pricing/pricing-receipt";

export default function UpgradeA() {
  return (
    <>
      <SiteNavbar />
      <PricingReceipt />
      <SiteFooter />
    </>
  );
}
