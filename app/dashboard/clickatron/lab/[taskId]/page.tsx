import { auth } from "@clerk/nextjs/server";
import { Clickatron2Lab } from "@/components/dashboard/Clickatron2/Clickatron2Lab";

export const revalidate = 30;

interface LabPageProps {
  params: {
    taskId: string;
  };
}

export default async function ClickatronLabPage({ params }: LabPageProps) {
  const session = await auth();
  if (!session?.userId) {
    // Better fallback instead of returning null
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 relative min-h-screen">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-4"></div>
            <p className="text-zinc-400">Authentication required...</p>
            <p className="text-sm text-zinc-500 mt-2">Please sign in to access Clickatron</p>
          </div>
        </div>
      </div>
    );
  }

  const { taskId } = await params;

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 relative min-h-screen">
      <Clickatron2Lab taskId={taskId} />
    </div>
  );
}