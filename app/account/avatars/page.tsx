import { redirect } from "next/navigation";

/** Account seam — resolves to the real avatar vault surface. */
export default function AccountAvatarsPage() {
  redirect("/dashboard/avatar-vault");
}
