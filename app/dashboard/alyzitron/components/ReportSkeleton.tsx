"use client";

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ReportSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Video Info Card */}
      <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
        <CardHeader>
          <div className="h-6 w-32 bg-zinc-800 rounded" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i}>
                <div className="h-4 w-20 bg-zinc-800 rounded mb-2" />
                <div className="h-5 w-28 bg-zinc-800 rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Results Card */}
      <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
        <CardHeader>
          <div className="h-6 w-36 bg-zinc-800 rounded" />
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Score */}
          <div className="p-4 bg-black/20 rounded-lg">
            <div className="h-4 w-24 bg-zinc-800 rounded mb-2" />
            <div className="h-8 w-16 bg-zinc-800 rounded" />
          </div>

          {/* Insights */}
          <div className="space-y-4">
            <div className="h-6 w-28 bg-zinc-800 rounded" />
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="p-3 bg-black/20 rounded-lg"
                >
                  <div className="h-4 w-full bg-zinc-800 rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Metrics */}
          <div className="space-y-4">
            <div className="h-6 w-32 bg-zinc-800 rounded" />
            <div className="grid sm:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="p-3 bg-black/20 rounded-lg"
                >
                  <div className="h-4 w-24 bg-zinc-800 rounded mb-2" />
                  <div className="h-5 w-16 bg-zinc-800 rounded" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}