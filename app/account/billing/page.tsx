import { redirect } from "next/navigation";

/** Account seam — resolves to the real billing & wallet surface. */
export default function AccountBillingPage() {
  redirect("/dashboard/billing");
}
