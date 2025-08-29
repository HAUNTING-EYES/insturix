import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { ClickatronTask } from '@/schemas/Clickatron';

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

    const validatedPage = Math.max(1, page);
    const validatedLimit = Math.min(Math.max(1, limit), 50);
    const skip = (validatedPage - 1) * validatedLimit;

    const query: any = { clerkUserId: userId };
    if (status) {
      const statusArray = status.split(',').map(s => s.trim());
      query.status = { $in: statusArray };
    }

    const aggregationPipeline = [
      { $match: query },
      {
        $facet: {
          metadata: [{ $count: "totalItems" }],
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: validatedLimit }
          ]
        }
      }
    ];

    const results = await ClickatronTask.aggregate(aggregationPipeline as any[]);
    const history = results[0].data;
    const totalItems = results[0].metadata[0] ? results[0].metadata[0].totalItems : 0;
    const totalPages = Math.ceil(totalItems / validatedLimit);

    const formattedHistory = history.map((task: any) => ({
      id: task._id?.toString() || '',
      name: task.title || 'Untitled Session',
      videoIdea: task.title || 'Untitled Session',
      thumbnail: null, // Clickatron doesn't have thumbnails yet
      timestamp: task.createdAt?.getTime() || Date.now(),
      preset: task.details?.workflow?.selectedPreset?.name || 'Default',
      selectedDirection: task.details?.workflow?.selectedDirection,
  // expose workflow stage so UI can decide whether to open ideation or canvas
  stage: task.details?.workflow?.stage || ((task.details && task.details.canvas && Array.isArray(task.details.canvas.variations) && task.details.canvas.variations.length > 0) ? 'canvas' : 'ideation'),
      status: task.status || 'active',
      createdAt: task.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: task.updatedAt?.toISOString() || new Date().toISOString(),
    }));

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