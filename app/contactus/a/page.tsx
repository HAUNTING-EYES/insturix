import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { ContactPickPath } from "@/components/shared/contact/contact-pick-path";

export default function ContactA() {
  return (
    <>
      <SiteNavbar />
      <ContactPickPath />
      <SiteFooter />
    </>
  );
}
