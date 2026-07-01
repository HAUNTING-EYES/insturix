import { ObjectId } from "mongodb";
import { getCollections } from "./mongodb";

export class AlyzitronTaskOwnershipError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AlyzitronTaskOwnershipError";
    this.status = status;
  }
}

function isObjectId(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value);
}

export async function requireOwnedAlyzitronTask(taskId: unknown, userId: string): Promise<any> {
  if (typeof taskId !== "string" || !taskId.trim()) {
    throw new AlyzitronTaskOwnershipError("Invalid task id", 400);
  }

  const normalizedTaskId = taskId.trim();
  const { analyses } = await getCollections();
  const taskQuery = { taskId: normalizedTaskId, clerkUserId: userId };
  const query = isObjectId(normalizedTaskId)
    ? { $or: [{ _id: ObjectId.createFromHexString(normalizedTaskId), clerkUserId: userId }, taskQuery] }
    : taskQuery;

  const task = await analyses.findOne(query);
  if (!task) {
    throw new AlyzitronTaskOwnershipError("Task not found", 404);
  }

  return task;
}

export function assertAlyzitronChatSessionOwned(
  session: { taskId?: string; userId?: string | null } | null,
  taskId: string,
  userId: string,
): void {
  if (!session || session.taskId !== taskId || session.userId !== userId) {
    throw new AlyzitronTaskOwnershipError("Chat session not found", 404);
  }
}
