import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getMusitronDb } from '@/lib/musitron-mongo';
import { MusitronTask } from '@/schemas/Musitron';

export async function GET(request: Request) {
  try {
    await getMusitronDb();
    const { userId, orgId } = await auth();

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

    // Build query based on org context
    // In org context: show all org items
    // In personal context: show only items without orgId (personal items)
    const query: any = orgId
      ? { orgId }  // Org context: filter by orgId
      : { clerkUserId: userId, $or: [{ orgId: { $exists: false } }, { orgId: null }] };  // Personal: user's items without orgId
    
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

    const results = await MusitronTask.aggregate(aggregationPipeline as any[]);
    const history = results[0].data;
    const totalItems = results[0].metadata[0] ? results[0].metadata[0].totalItems : 0;
    const totalPages = Math.ceil(totalItems / validatedLimit);

    const formattedHistory = history.map((task: any) => ({
      ...task,
      _id: task._id?.toString() || '',
      createdAt: task.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: task.updatedAt?.toISOString() || new Date().toISOString(),
      ...(task.completedAt && { completedAt: new Date(task.completedAt).toISOString() }),
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
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}