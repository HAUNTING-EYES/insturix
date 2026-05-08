import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { NewsroomBroadcast } from "@/components/shared/newsroom/newsroom-broadcast";

export default function Newsroom() {
  return (
    <>
      <SiteNavbar />
      <NewsroomBroadcast />
      <SiteFooter />
    </>
  );
}
