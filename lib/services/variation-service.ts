import { MongoClient } from "mongodb";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME || "clickatron";
const COLLECTION = "variations";

export interface Variation {
  parentVariationId: string;
  imageRef: string;
  modelId: string;
  prompt: string;
  maskUrl: string;
  falResponse: any;
  createdAt?: Date;
}

export async function createVariation(variation: Variation): Promise<Variation> {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const col = db.collection(COLLECTION);
    const doc = { ...variation, createdAt: new Date() };
    await col.insertOne(doc);
    return doc as Variation;
  } finally {
    await client.close();
  }
}
