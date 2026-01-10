import { Suspense } from "react";
import AnalyticsTab from "@/components/admin/AnalyticsTab";

export const metadata = {
	title: "Analytics | Admin",
	description: "Admin analytics dashboard",
	robots: "noindex, nofollow",
};

export default function AdminAnalyticsPage() {
	return (
		<Suspense
			fallback={
				<div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-950">
					<div className="w-8 h-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
				</div>
			}
		>
			<AnalyticsTab />
		</Suspense>
	);
}
