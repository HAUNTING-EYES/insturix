import { redirect } from "next/navigation";

/** Account seam — resolves to the real team & organizations surface. */
export default function AccountOrgPage() {
  redirect("/dashboard/org");
}
