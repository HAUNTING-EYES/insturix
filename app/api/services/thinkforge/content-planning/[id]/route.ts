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

// PUT - Update a content card
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json();
    const { updates } = body;

    if (!updates) {
      return NextResponse.json(
        { error: 'Invalid request. Updates are required.' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const collection = db.collection(COLLECTION_NAME);

    // Verify the card belongs to the user
    const existingCard = await collection.findOne({ id, userId });
    if (!existingCard) {
      return NextResponse.json(
        { error: 'Content card not found' },
        { status: 404 }
      );
    }

    // Update the card
    const updatedCard = {
      ...existingCard,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await collection.updateOne(
      { id, userId },
      { $set: updatedCard }
    );

    // Remove userId and _id from response
    const { userId: _, _id, ...responseCard } = updatedCard;

    return NextResponse.json({ card: responseCard });
  } catch (error) {
    console.error('Error updating content card:', error);
    return NextResponse.json(
      { error: 'Failed to update content card' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a content card
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    const { db } = await connectToDatabase();
    const collection = db.collection(COLLECTION_NAME);

    // Verify the card belongs to the user
    const existingCard = await collection.findOne({ id, userId });
    if (!existingCard) {
      return NextResponse.json(
        { error: 'Content card not found' },
        { status: 404 }
      );
    }

    await collection.deleteOne({ id, userId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting content card:', error);
    return NextResponse.json(
      { error: 'Failed to delete content card' },
      { status: 500 }
    );
  }
}

