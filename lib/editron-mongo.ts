/**
 * MongoDB connection utility for Editron service.
 *
 * CONSOLIDATED: Delegates to lib/editron/db/mongodb.ts (single shared client).
 * Previously had its own MongoClient with zero pool config — now uses the
 * shared client with proper pooling (maxPoolSize=10, minPoolSize=2).
 */

import { Collection } from "mongodb";
import { connectToDatabase } from "@/lib/editron/db/mongodb";
import type { EditronTask } from "@/lib/types";

const dbName = process.env.MONGODB_DB_NAME || 'insturix_prod';
const collectionName = process.env.EDITRON_MONGO_TASKS_COLLECTION || 'editron_tasks';

export async function getMongoClient() {
  const { client } = await connectToDatabase();
  return client;
}

export async function getEditronDb() {
  const { client } = await connectToDatabase();
  return client.db(dbName);
}

export async function getTasksCollection(): Promise<Collection<EditronTask>> {
  const database = await getEditronDb();
  return database.collection<EditronTask>(collectionName);
}