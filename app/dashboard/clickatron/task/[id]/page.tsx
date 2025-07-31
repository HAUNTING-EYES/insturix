import { auth } from "@clerk/nextjs/server";
import { getClickatronDb } from "@/lib/clickatron-mongo";
import { ClickatronTask, IClickatronTask } from "@/schemas/Clickatron";
import { notFound } from "next/navigation";
import { TaskDetails } from "./components/TaskDetails";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
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

    await getClickatronDb();
    
    const objectId = new Types.ObjectId(id);
    
    const task = await ClickatronTask.findOne({
      _id: objectId,
      clerkUserId: session.userId,
    }).lean() as IClickatronTask | null;

    if (!task) {
      return { error: 'not_found' };
    }

    return {
      task: {
        ...task,
        _id: task._id.toString(),
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
        completedAt: task.completedAt ? (task.completedAt instanceof Date ? task.completedAt.toISOString() : new Date(task.completedAt).toISOString()) : undefined,
      }
    };
  } catch (error) {
    console.error("Error fetching clickatron task:", error);
    return { error: 'server_error' };
  }
}

export default async function TaskDetailsPage({ params }: PageProps) {
  const resolvedParams = await params;
  const result = await getTask(resolvedParams.id);

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