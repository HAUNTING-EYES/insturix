import { LoadingScreen } from "@/components/Loader/LoadingScreen";

// This file is the Next.js loading UI for the entire /dashboard route segment.
// Next.js automatically wraps the page in a Suspense boundary using this component,
// so navigating to any /dashboard/* route shows a proper loading state immediately
// instead of a blank screen while server components and data fetches resolve.
export default function DashboardLoading() {
  return <LoadingScreen />;
}
