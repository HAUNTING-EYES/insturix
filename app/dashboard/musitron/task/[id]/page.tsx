import { auth } from "@clerk/nextjs/server";
import { getMusitronDb } from "@/lib/musitron-mongo";
import { MusitronTask, IMusitronTask } from "@/schemas/Musitron";
import { notFound } from "next/navigation";
import { TaskDetails } from "./components/TaskDetails";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";

interface PageProps {
  params: {
    id: string;
  };
}

async function getTask(id: string) {
  const session = await auth();
  
  if (!session?.userId) {
    return { error: 'unauthorized' };
  }

  try {
    // Validate ObjectId format
    if (!Types.ObjectId.isValid(id)) {
      return { error: 'invalid_id' };
    }

    await getMusitronDb();
    
    const task = await MusitronTask.findOne({
      _id: new Types.ObjectId(id),
      userId: session.userId,
    }) as IMusitronTask | null;

    if (!task) {
      return { error: 'not_found' };
    }

    return { task };
  } catch (error) {
    console.error("Error fetching musitron task:", error);
    return { error: 'server_error' };
  }
}

export default async function MusitronTaskDetailsPage({ params }: PageProps) {
  const result = await getTask(params.id);

  if ('error' in result) {
    notFound();
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <TaskDetails task={result.task} />
      </div>
    </div>
  );
}