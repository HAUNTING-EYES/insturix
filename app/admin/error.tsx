"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log the error to the console for debugging
    // eslint-disable-next-line no-console
    console.error("/admin error boundary:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
      <p className="text-zinc-600 dark:text-zinc-400 mb-6">
        A client-side error occurred while loading the admin section. Please try again.
      </p>
      <div className="flex gap-3">
        <button
          className="px-4 py-2 rounded bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
          onClick={() => reset()}
        >
          Retry
        </button>
        <Link href="/" className="px-4 py-2 rounded border border-zinc-300 dark:border-zinc-700">
          Go Home
        </Link>
      </div>
      {process.env.NODE_ENV === "development" && (
        <pre className="mt-6 text-left text-xs max-w-3xl overflow-auto p-3 bg-zinc-100 dark:bg-zinc-900 rounded">
          {String(error?.stack || error?.message)}
        </pre>
      )}
    </div>
  );
}
