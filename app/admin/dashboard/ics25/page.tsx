import { Suspense } from "react";
import ICS25Dashboard from "@/components/admin/ICS25Dashboard";

export const metadata = {
	title: "ICS'25 Admin | Insturix",
	description: "ICS'25 event dashboard and controls",
	robots: "noindex, nofollow",
};

export default function Ics25AdminPage() {
	return (
		<Suspense fallback={<div className="min-h-[50vh] flex items-center justify-center">Loading…</div>}>
			<div className="container max-w-7xl mx-auto px-4 py-8">
				<ICS25Dashboard />
			</div>
		</Suspense>
	);
}

