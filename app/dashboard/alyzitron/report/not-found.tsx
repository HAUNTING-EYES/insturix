import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="container mx-auto p-8">
      <div className="max-w-md mx-auto text-center py-16">
        <div className="rounded-xl bg-black/40 border border-zinc-800 p-8">
          <div className="flex justify-center mb-6">
            <FileQuestion className="h-16 w-16 text-zinc-500" />
          </div>
          <h2 className="text-2xl font-semibold text-zinc-100 mb-2">
            Analysis Not Found
          </h2>
          <p className="text-zinc-400 mb-6">
            This analysis may have been deleted or you may not have permission to view it.
          </p>
          <Button asChild>
            <Link href="/dashboard/alyzitron">
              Return to Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}