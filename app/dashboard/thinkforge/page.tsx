import { lazy, Suspense } from "react";

// Lazy load ComingSoon component
const ComingSoon = lazy(() => import("@/components/ComingSoon").then(mod => ({ default: mod.ComingSoon })));

export const revalidate = 60;

export default function ThinkforgeDashboard() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-zinc-700 border-t-purple-500 rounded-full animate-spin mx-auto"></div>
          <p className="text-zinc-400">Loading Thinkforge...</p>
        </div>
      </div>
    }>
      <ComingSoon serviceName="Thinkforge" progressPercentage={80}/>
    </Suspense>
  );
}
