import { Collection, ObjectId } from "mongodb";
import { connectToDatabase, withErrorHandling } from "@/app/api/services/alyzitron/utils/mongodb";

// ---------------------------------------------------------------------------
// Collection names — follow the existing alyzitron_ prefix convention
// ---------------------------------------------------------------------------
const COLLECTIONS = {
  TRANSCRIPTIONS: "alyzitron_transcriptions",
  CHAT_SESSIONS:  "alyzitron_chat_sessions",
} as const;

// ---------------------------------------------------------------------------
// Document types
// ---------------------------------------------------------------------------
export type TranscriptionStatus = "processing" | "completed" | "error";
export type MessageRole = "user" | "assistant";

export interface SpeakerSegmentDoc {
  speaker: string;
  text: string;
  start: number; // ms
  end: number;   // ms
}

export interface TranscriptionDoc {
  _id?: ObjectId;
  taskId: string;
  audioUrl: string;
  deepgramRequestId: string;
  status: TranscriptionStatus;
  text: string;
  detectedLanguage: string | null;
  confidence: number | null;
  speakerSegments: SpeakerSegmentDoc[];
  formattedTranscript: string;
  durationMs: number | null;
  wordCount: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessageDoc {
  role: MessageRole;
  content: string;
  timestamp: Date;
}

export interface ChatSessionDoc {
  _id?: ObjectId;
  taskId: string;
  userId: string | null;
  messages: ChatMessageDoc[];
  summary: string | null;
  summarizedUpToIndex: number;
  totalMessagesEver: number;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Collection getters — typed wrappers around connectToDatabase()
// ---------------------------------------------------------------------------
export async function getAlyzitronCollections(): Promise<{
  transcriptions: Collection<TranscriptionDoc>;
  chatSessions: Collection<ChatSessionDoc>;
}> {
  const { db } = await connectToDatabase();
  return {
    transcriptions: db.collection<TranscriptionDoc>(COLLECTIONS.TRANSCRIPTIONS),
    chatSessions:   db.collection<ChatSessionDoc>(COLLECTIONS.CHAT_SESSIONS),
  };
}

// ---------------------------------------------------------------------------
// Index initialization — call once at startup or from an admin route.
// Safe to call multiple times (createIndex is idempotent).
// ---------------------------------------------------------------------------
export async function initializeAlyzitronIndexes(): Promise<void> {
  const { transcriptions, chatSessions } = await getAlyzitronCollections();

  await transcriptions.createIndexes([
    { key: { taskId: 1 }, unique: true },
    { key: { status: 1 } },
  ]);

  await chatSessions.createIndexes([
    { key: { taskId: 1, userId: 1 } },
    { key: { taskId: 1 } },
  ]);
}

// ---------------------------------------------------------------------------
// Transcription helpers
// ---------------------------------------------------------------------------
export async function findTranscription(
  taskId: string
): Promise<TranscriptionDoc | null> {
  return withErrorHandling(async () => {
    const { transcriptions } = await getAlyzitronCollections();
    return transcriptions.findOne({ taskId });
  });
}

export async function upsertTranscriptionProcessing(
  taskId: string,
  audioUrl: string
): Promise<void> {
  return withErrorHandling(async () => {
    const { transcriptions } = await getAlyzitronCollections();
    const now = new Date();
    await transcriptions.updateOne(
      { taskId },
      {
        $set:         { audioUrl, status: "processing", updatedAt: now },
        $unset:       { errorMessage: "" },
        $setOnInsert: { createdAt: now, taskId },
      },
      { upsert: true }
    );
  });
}

export async function upsertTranscriptionCompleted(
  taskId: string,
  data: Omit<TranscriptionDoc, "_id" | "taskId" | "audioUrl" | "status" | "createdAt" | "updatedAt">
): Promise<void> {
  return withErrorHandling(async () => {
    const { transcriptions } = await getAlyzitronCollections();
    await transcriptions.updateOne(
      { taskId },
      {
        $set: {
          ...data,
          status:    "completed",
          updatedAt: new Date(),
        },
      }
    );
  });
}

export async function upsertTranscriptionError(
  taskId: string,
  errorMessage: string
): Promise<void> {
  return withErrorHandling(async () => {
    const { transcriptions } = await getAlyzitronCollections();
    await transcriptions.updateOne(
      { taskId },
      { $set: { status: "error", errorMessage, updatedAt: new Date() } }
    );
  });
}

// ---------------------------------------------------------------------------
// Chat session helpers
// ---------------------------------------------------------------------------
export async function findChatSession(
  taskId: string,
  userId: string | null
): Promise<ChatSessionDoc | null> {
  return withErrorHandling(async () => {
    const { chatSessions } = await getAlyzitronCollections();
    return chatSessions.findOne({ taskId, userId });
  });
}

export async function findChatSessionById(
  sessionId: string
): Promise<ChatSessionDoc | null> {
  return withErrorHandling(async () => {
    const { chatSessions } = await getAlyzitronCollections();
    return chatSessions.findOne({ _id: new ObjectId(sessionId) });
  });
}

export async function createChatSession(
  taskId: string,
  userId: string | null
): Promise<ChatSessionDoc> {
  return withErrorHandling(async () => {
    const { chatSessions } = await getAlyzitronCollections();
    const now = new Date();
    const doc: ChatSessionDoc = {
      taskId,
      userId,
      messages: [],
      summary: null,
      summarizedUpToIndex: 0,
      totalMessagesEver: 0,
      createdAt: now,
      updatedAt: now,
    };
    const result = await chatSessions.insertOne(doc);
    return { ...doc, _id: result.insertedId };
  });
}

export async function saveChatSessionTurn(
  sessionId: ObjectId,
  userMessage: ChatMessageDoc,
  assistantMessage: ChatMessageDoc,
  summary: string | null,
  summarizedUpToIndex: number,
  totalMessagesEver: number
): Promise<void> {
  return withErrorHandling(async () => {
    const { chatSessions } = await getAlyzitronCollections();
    await chatSessions.updateOne(
      { _id: sessionId },
      {
        $push: { messages: { $each: [userMessage, assistantMessage] } } as any,
        $set: {
          summary,
          summarizedUpToIndex,
          totalMessagesEver,
          updatedAt: new Date(),
        },
      }
    );
  });
}

export async function deleteChatSession(
  taskId: string,
  userId: string | null
): Promise<void> {
  return withErrorHandling(async () => {
    const { chatSessions } = await getAlyzitronCollections();
    await chatSessions.deleteOne({ taskId, userId });
  });
}