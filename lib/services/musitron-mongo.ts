import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

declare global {
  var _mongoClientPromise: Promise<MongoClient>;
}

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(MONGODB_URI);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(MONGODB_URI);
  clientPromise = client.connect();
}

export async function getMusitronCollections() {
  const client = await clientPromise;
  const dbName = process.env.MONGODB_DB_NAME || 'insturix_dev';
  const db = client.db(dbName);
  
  return {
    musicGenerations: db.collection('musitron_tasks'),
    musitronProjects: db.collection('musitron_projects'),
  };
}

export { clientPromise };