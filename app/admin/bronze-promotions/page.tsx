import BronzePromotionsAdmin from "@/components/admin/BronzePromotionsAdmin";

export const metadata = {
  title: "Bronze Promotions · Admin | Insturix",
  description: "Manage Bronze Pass promotion submissions",
  robots: "noindex, nofollow",
};

/**
 * Admin Bronze Promotions Page
 *
 * Protected by AdminLayout - only accessible to authenticated admin users.
 * Admin verification happens at the layout level.
 */
export default async function AdminBronzePromotionsPage() {
  return (
    <div className="min-h-screen">
      <BronzePromotionsAdmin />
    </div>
  );
}
