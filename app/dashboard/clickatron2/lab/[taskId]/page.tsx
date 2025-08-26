import { auth } from "@clerk/nextjs/server";
import { Clickatron2Lab } from "@/components/dashboard/Clickatron2/Clickatron2Lab";

export const revalidate = 30;

interface LabPageProps {
  params: {
    taskId: string;
  };
}

export default async function Clickatron2LabPage({ params }: LabPageProps) {
  const session = await auth();
  if (!session?.userId) return null;

  const { taskId } = await params;

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 relative min-h-screen">
      <Clickatron2Lab taskId={taskId} />
    </div>
  );
}