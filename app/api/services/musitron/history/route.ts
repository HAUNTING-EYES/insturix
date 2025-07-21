import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getMusitronDb } from '@/lib/musitron-mongo';
import { MusitronTask } from '@/schemas/Musitron';

export async function GET(request: Request) {
  try {
    await getMusitronDb();
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

    const query: any = { userId };
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
            { $limit: validatedLimit },
            { $project: { "results.thumbnail.prompt": 0 } }
          ]
        }
      }
    ];

    const results = await MusitronTask.aggregate(aggregationPipeline as any[]);
    const history = results[0].data;
    const totalItems = results[0].metadata[0] ? results[0].metadata[0].totalItems : 0;
    const totalPages = Math.ceil(totalItems / validatedLimit);

    let formattedHistory = history.map((task: any) => ({
      ...task,
      _id: task._id?.toString() || '',
      createdAt: task.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: task.updatedAt?.toISOString() || new Date().toISOString(),
      ...(task.completedAt && { completedAt: new Date(task.completedAt).toISOString() }),
    }));

    // If no tasks, inject demo tasks
    if (formattedHistory.length === 0 && validatedPage === 1) {
      formattedHistory = [
        {
          _id: "demo-listed",
          clerkUserId: "demo",
          title: "Listed Demo Track",
          style: "Demo",
          instrumental_only: false,
          lyrics: "",
          status: "listed",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          unread: true,
        },
        {
          _id: "demo-processing",
          clerkUserId: "demo",
          title: "Processing Demo Track",
          style: "Demo",
          instrumental_only: false,
          lyrics: "",
          status: "processing",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          unread: true,
        },
        {
          _id: "demo-completed",
          clerkUserId: "demo",
          title: "Completed Demo Track",
          style: "Demo",
          instrumental_only: false,
          lyrics: "",
          status: "completed",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          unread: false,
        },
        {
          _id: "demo-failed",
          clerkUserId: "demo",
          title: "Failed Demo Track",
          style: "Demo",
          instrumental_only: false,
          lyrics: "",
          status: "failed",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          unread: false,
        },
      ];
    }

    return NextResponse.json({
      data: formattedHistory,
      pagination: {
        totalItems: formattedHistory.length,
        totalPages: 1,
        currentPage: validatedPage,
        itemsPerPage: validatedLimit,
        hasNext: false,
        hasPrev: false,
      }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}