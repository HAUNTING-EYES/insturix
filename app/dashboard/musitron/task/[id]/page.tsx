import { auth } from "@clerk/nextjs/server";
import { getMusitronDb } from "@/lib/musitron-mongo";
import { MusitronTask, IMusitronTask } from "@/schemas/Musitron";
import { notFound } from "next/navigation";
import MusicPlayerWrapper from "@/components/dashboard/Musitron/MusicPlayerWrapper";
import { TaskDetails } from "./components/TaskDetails";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
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
    return { error: "unauthorized" };
  }

  try {
    if (!Types.ObjectId.isValid(id)) {
      return { error: "invalid_id" };
    }

    await getMusitronDb();

    const task = await MusitronTask.findOne({
      _id: new Types.ObjectId(id),
      clerkUserId: session.userId,
    }).lean() as IMusitronTask | null;

    if (!task) {
      return { error: "not_found" };
    }

    // Explicitly cast _id to ObjectId before calling toString
    let stringId = "";
    if (typeof task._id === "string") {
      stringId = task._id;
    } else if (typeof task._id === "object" && task._id && "toString" in task._id) {
      stringId = (task._id as { toString: () => string }).toString();
    } else {
      stringId = String(task._id);
    }

    return {
      task: {
        ...task,
        _id: stringId,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      },
    };
  } catch (error) {
    console.error("Error fetching musitron task:", error);
    return { error: "server_error" };
  }
}

export default async function TaskDetailsPage({ params }: PageProps) {
  const resolvedParams = await params;
  const result = await getTask(resolvedParams.id);

  if ("error" in result) {
    notFound();
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Back to History — a client-side Link, not the old GET <form> that
          forced a full page load and dropped any ?tab= context. */}
      <div className="mb-6 max-w-4xl mx-auto">
        <Button variant="outline" asChild className="flex items-center gap-2 w-fit">
          <Link href="/dashboard/musitron">
            <ArrowLeft className="w-4 h-4" />
            Back to Music
          </Link>
        </Button>
      </div>
      <div className="max-w-4xl mx-auto">
        <TaskDetails task={result.task} />
        {result.task.status === "completed" && (
          <div className="mt-8">
            <MusicPlayerWrapper task={result.task} />
          </div>
        )}
      </div>
    </div>
  );
}