import { redirect } from "next/navigation";

/** Account seam — resolves to the real brand vault surface. */
export default function AccountBrandsPage() {
  redirect("/dashboard/brand-vault");
}
