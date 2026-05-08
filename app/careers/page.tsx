import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { CareersConstruction } from "@/components/shared/careers/careers-construction";

export default function Careers() {
  return (
    <>
      <SiteNavbar />
      <CareersConstruction />
      <SiteFooter />
    </>
  );
}
