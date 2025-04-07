import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { logger } from "../../../utils/logger";

async function ensureDirectory(path: string) {
  try {
    await mkdir(path, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ userId: string; filename: string }> }
) {
  try {
    const params = await context.params;
    const session = await auth();

    if (!session?.userId || session.userId !== params.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get file data from request
    const fileData = await request.arrayBuffer();
    const uploadsDir = join(process.cwd(), 'uploads', 'alyzitron', `user_${params.userId}`);
    
    // Ensure the directory exists
    await ensureDirectory(uploadsDir);
    
    const filePath = join(uploadsDir, params.filename);
    const relativeFilePath = join('uploads', 'alyzitron', `user_${params.userId}`, params.filename).replace(/\\/g, '/');

    // Save file
    await writeFile(filePath, Buffer.from(fileData));

    return NextResponse.json({
      success: true,
      path: relativeFilePath
    });

  } catch (error) {
    logger.error('File upload failed', {
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });

    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}