import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { ServiceUsageService } from "@/lib/services/serviceUsageService";
import { IServiceLimits } from "@/schemas/user";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const serviceName = searchParams.get('service') as keyof IServiceLimits;

    if (serviceName) {
      // Get usage for specific service
      const allUsage = await ServiceUsageService.getServiceUsageForAllServices(session.userId);
      const serviceUsage = allUsage[serviceName] || {};
      
      return NextResponse.json(serviceUsage);
    } else {
      // Get usage for all services
      const allUsage = await ServiceUsageService.getServiceUsageForAllServices(session.userId);
      
      return NextResponse.json(allUsage);
    }

  } catch (error) {
    console.error('Error fetching service usage:', error);
    return NextResponse.json(
      { error: 'Failed to fetch service usage' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { serviceName, limitType } = await request.json();

    if (!serviceName || !limitType) {
      return NextResponse.json(
        { error: 'serviceName and limitType are required' },
        { status: 400 }
      );
    }

    const usageInfo = await ServiceUsageService.canUseService(
      session.userId,
      serviceName,
      limitType
    );

    return NextResponse.json(usageInfo);

  } catch (error) {
    console.error('Error fetching specific service usage:', error);
    return NextResponse.json(
      { error: 'Failed to fetch service usage' },
      { status: 500 }
    );
  }
}