import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { MongoClient, Db } from 'mongodb';
import {
  contentCardClientView,
  isContentCardValidationError,
  normalizeContentCardForStorage,
} from '@/lib/thinkforge/planning/content-card-contract';

export const dynamic = 'force-dynamic';

if (!process.env.MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

if (!process.env.MONGODB_DB_NAME) {
  throw new Error('Please define the MONGODB_DB_NAME environment variable');
}

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME;
const COLLECTION_NAME = 'thinkforge_content_cards';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(MONGODB_DB_NAME);

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

// GET - Fetch all content cards for the authenticated user
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const collection = db.collection(COLLECTION_NAME);

    const cards = await collection.find({ userId }).toArray();

    const formattedCards = cards.map(card =>
      contentCardClientView(normalizeContentCardForStorage(card, { userId }))
    );

    return NextResponse.json({ cards: formattedCards });
  } catch (error) {
    console.error('Error fetching content cards:', error);
    return NextResponse.json(
      { error: 'Failed to fetch content cards' },
      { status: 500 }
    );
  }
}

// POST - Create a new content card
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { card } = body;

    if (!card || !card.title) {
      return NextResponse.json(
        { error: 'Invalid card data. Title is required.' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const collection = db.collection(COLLECTION_NAME);

    const now = new Date().toISOString();
    const newCard = normalizeContentCardForStorage(card, { userId, now });

    await collection.insertOne(newCard);

    return NextResponse.json({ card: contentCardClientView(newCard) }, { status: 201 });
  } catch (error) {
    if (isContentCardValidationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error creating content card:', error);
    return NextResponse.json(
      { error: 'Failed to create content card' },
      { status: 500 }
    );
  }
}
