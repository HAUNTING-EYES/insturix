'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, Sparkles } from 'lucide-react';

export default function AnalyticsTab() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-2xl w-full border-2 border-dashed border-zinc-200 dark:border-zinc-800">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 p-4 rounded-full bg-gradient-to-br from-fuchsia-500/10 to-purple-500/10 w-fit">
            <BarChart3 className="w-12 h-12 text-fuchsia-600 dark:text-fuchsia-400" />
          </div>
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-fuchsia-600 to-purple-600 dark:from-fuchsia-400 dark:to-purple-400 bg-clip-text text-transparent">
            Analytics Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-6 pb-8">
          <div className="flex items-center justify-center gap-2 text-zinc-600 dark:text-zinc-400">
            <Sparkles className="w-5 h-5 text-yellow-500" />
            <p className="text-lg font-medium">Coming Soon</p>
            <Sparkles className="w-5 h-5 text-yellow-500" />
          </div>
          
          <p className="text-zinc-600 dark:text-zinc-400 max-w-md mx-auto">
            We are building comprehensive site-wide analytics to help you track performance, user engagement, and growth metrics across the entire platform.
          </p>

          <div className="grid grid-cols-3 gap-4 pt-4">
            <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900">
              <TrendingUp className="w-6 h-6 mx-auto mb-2 text-green-500" />
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Traffic Analytics</p>
            </div>
            <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900">
              <BarChart3 className="w-6 h-6 mx-auto mb-2 text-blue-500" />
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Revenue Trends</p>
            </div>
            <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900">
              <Sparkles className="w-6 h-6 mx-auto mb-2 text-purple-500" />
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">User Insights</p>
            </div>
          </div>

          <p className="text-sm text-zinc-500 dark:text-zinc-500 pt-4">
            Stay tuned for powerful analytics features!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
