import React from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export default function ReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      {/* Navigation */}
      {/* <div className="fixed top-0 left-0 right-0 h-16 bg-black/40 backdrop-blur-xl border-b border-zinc-800 z-10">
        <div className="container h-full mx-auto flex items-center px-8">
          <Link
            href="/dashboard/alyzitron"
            className="flex items-center text-zinc-400 hover:text-zinc-300 transition-colors"
          >
            <ChevronLeft className="h-5 w-5 mr-2" />
            <span>Back to Dashboard</span>
          </Link>
        </div>
      </div> */}

      {/* Content */}
      <div className="pt-16">
        {children}
      </div>
    </div>
  );
}