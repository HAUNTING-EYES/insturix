import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { MongoClient, Db } from 'mongodb';
import { ContentCard } from '@/app/dashboard/thinkforge/types';

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

    // Remove MongoDB _id and convert to ContentCard format
    const formattedCards: ContentCard[] = cards.map(card => {
      const { _id, ...rest } = card;
      return rest as ContentCard;
    });

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
    const newCard: ContentCard = {
      ...card,
      id: card.id || `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      createdAt: card.createdAt || now,
      updatedAt: now,
      customTags: card.customTags || [],
      plannedDates: card.plannedDates || (card.date ? [card.date] : [now]),
      tags: card.tags || [],
    };

    await collection.insertOne(newCard);

    // Remove userId from response (not needed on client)
    const { userId: _, ...responseCard } = newCard;

    return NextResponse.json({ card: responseCard }, { status: 201 });
  } catch (error) {
    console.error('Error creating content card:', error);
    return NextResponse.json(
      { error: 'Failed to create content card' },
      { status: 500 }
    );
  }
}

