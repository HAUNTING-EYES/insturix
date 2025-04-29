// MongoDB connection utility for Editron service

import { MongoClient, Db, Collection } from "mongodb";

const uri = process.env.MONGODB_URI!;
const dbName = process.env.MONGODB_DB_NAME!;
const collectionName = process.env.EDITRON_MONGO_TASKS_COLLECTION!;

if (!uri || !dbName || !collectionName) {
  throw new Error("Missing MongoDB environment variables for Editron integration.");
}

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getMongoClient(): Promise<MongoClient> {
  if (client) {
    return client;
  }
  client = new MongoClient(uri, { });
  await client.connect();
  return client;
}

export async function getEditronDb(): Promise<Db> {
  if (db) return db;
  const mongoClient = await getMongoClient();
  db = mongoClient.db(dbName);
  return db;
}

import { EditronTask } from "@/lib/types";

export async function getTasksCollection(): Promise<Collection<EditronTask>> {
  const database = await getEditronDb();
  return database.collection<EditronTask>(collectionName);
}