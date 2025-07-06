import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';

export async function GET(request: Request) {
  try {
    await getClickatronDb();
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);
    const status = url.searchParams.get('status');

    // Validate pagination parameters
    const validatedPage = Math.max(1, page);
    const validatedLimit = Math.min(Math.max(1, limit), 50); // Max 50 items per page
    const skip = (validatedPage - 1) * validatedLimit;

    // Build query
    const query: any = { userId };
    
    if (status) {
      const statusArray = status.split(',').map(s => s.trim());
      query.status = { $in: statusArray };
    }

    // Get total count for pagination
    const totalItems = await ClickatronTask.countDocuments(query);
    const totalPages = Math.ceil(totalItems / validatedLimit);

    // Get paginated results
    const history = await ClickatronTask.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(validatedLimit)
      .lean();

    // Format response
    const formattedHistory = history.map(task => {
      // Remove prompt from root and nested thumbnail
      const { prompt, ...taskWithoutPrompt } = task;
      let results = taskWithoutPrompt.results;
      if (results && results.thumbnail && typeof results.thumbnail === "object") {
        // Remove prompt from thumbnail
        const { prompt, ...thumbnailWithoutPrompt } = results.thumbnail;
        results = { ...results, thumbnail: thumbnailWithoutPrompt };
      }
      return {
        ...taskWithoutPrompt,
        results,
        _id: task._id?.toString() || '',
        createdAt: task.createdAt?.toISOString() || new Date().toISOString(),
        updatedAt: task.updatedAt?.toISOString() || new Date().toISOString(),
        ...(task.completedAt && { completedAt: new Date(task.completedAt).toISOString() }),
      };
    });

    return NextResponse.json({
      data: formattedHistory,
      pagination: {
        totalItems,
        totalPages,
        currentPage: validatedPage,
        itemsPerPage: validatedLimit,
        hasNext: validatedPage < totalPages,
        hasPrev: validatedPage > 1,
      }
    });
  } catch (error) {
    console.error('Error fetching Clickatron history:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}