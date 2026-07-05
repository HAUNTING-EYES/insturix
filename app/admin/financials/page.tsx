import ProviderCostFinancials from "@/components/admin/ProviderCostFinancials";

export const metadata = {
  title: "Financials | Admin",
  description: "Provider cost and margin reporting",
  robots: "noindex, nofollow",
};

export default function AdminFinancialsPage() {
  return <ProviderCostFinancials />;
}