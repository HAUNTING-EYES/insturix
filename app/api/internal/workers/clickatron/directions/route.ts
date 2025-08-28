import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/lib/qstash';
import { createJob, updateJob, completeJob, failJob, getRedisClient } from '@/lib/clickatron-jobs';

interface DirectionGenerationPayload {
  jobId: string;
  userId: string;
  sessionId: string;
  videoIdea: string;
  selectedPreset?: {
    id: string;
    name: string;
    aspectRatio: string;
    dimensions: string;
  };
  count: number;
}

// Mock direction generation function (same as before)
const generateMockDirections = (videoIdea: string, preset: any, count: number) => {
  const directionTemplates = [
    {
      title: "Warm & Inviting",
      description: "Soft, warm lighting with inviting colors",
      prompt: `Create a warm and inviting thumbnail for "${videoIdea}" with soft lighting and welcoming colors`,
      tags: ["warm", "inviting", "soft", "welcoming"],
      styleHints: ["warm tones", "soft lighting", "comfortable"],
    },
    {
      title: "Bold & Dramatic",
      description: "High contrast with dramatic lighting effects",
      prompt: `Design a bold and dramatic thumbnail for "${videoIdea}" with high contrast and striking visual impact`,
      tags: ["bold", "dramatic", "contrast", "striking"],
      styleHints: ["high contrast", "dramatic lighting", "bold colors"],
    },
    {
      title: "Clean & Minimal",
      description: "Simple, clean design with minimal elements",
      prompt: `Create a clean and minimal thumbnail for "${videoIdea}" with simple composition and essential elements only`,
      tags: ["clean", "minimal", "simple", "essential"],
      styleHints: ["minimal design", "clean layout", "simple elements"],
    },
    {
      title: "Energetic & Dynamic",
      description: "Fast-paced with dynamic movement and energy",
      prompt: `Design an energetic and dynamic thumbnail for "${videoIdea}" with movement and high energy visuals`,
      tags: ["energetic", "dynamic", "movement", "fast-paced"],
      styleHints: ["dynamic composition", "energetic colors", "movement"],
    },
    {
      title: "Professional & Polished",
      description: "Corporate style with professional appearance",
      prompt: `Create a professional and polished thumbnail for "${videoIdea}" with corporate styling and clean presentation`,
      tags: ["professional", "polished", "corporate", "clean"],
      styleHints: ["professional design", "corporate colors", "polished look"],
    },
    {
      title: "Creative & Artistic",
      description: "Artistic expression with creative elements",
      prompt: `Design a creative and artistic thumbnail for "${videoIdea}" with artistic expression and imaginative elements`,
      tags: ["creative", "artistic", "imaginative", "expression"],
      styleHints: ["artistic style", "creative elements", "imaginative"],
    },
  ];

  // Select random directions
  const selectedDirections = [];
  const availableDirections = [...directionTemplates];

  for (let i = 0; i < Math.min(count, availableDirections.length); i++) {
    const randomIndex = Math.floor(Math.random() * availableDirections.length);
    const template = availableDirections.splice(randomIndex, 1)[0];

    selectedDirections.push({
      id: `direction_${Date.now()}_${i}`,
      title: template.title,
      description: template.description,
      prompt: template.prompt,
      tags: template.tags,
      styleHints: template.styleHints,
      generatedAt: new Date().toISOString(),
    });
  }

  return selectedDirections;
};

export async function POST(request: NextRequest) {
  try {
    console.log('Direction generation worker called');

    // Verify QStash signature (simplified for now)
    const signature = request.headers.get('upstash-signature');
    const body = await request.text();

    // For now, skip signature verification in development
    // const isValid = verifyQStashSignature(signature, body, process.env.QSTASH_CURRENT_SIGNING_KEY!);
    // if (!isValid) {
    //   console.error('Invalid QStash signature');
    //   return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    // }

    const payload: DirectionGenerationPayload = JSON.parse(body);
    console.log('Processing direction generation job:', payload.jobId);

    // Update job status to running
    await updateJob(payload.jobId, {
      status: 'running',
      stage: 'generating',
      progress: 10,
    });

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Generate directions
    const directions = generateMockDirections(
      payload.videoIdea,
      payload.selectedPreset,
      payload.count
    );

    // Update progress
    await updateJob(payload.jobId, {
      status: 'running',
      stage: 'finalizing',
      progress: 90,
    });

    // Simulate final processing
    await new Promise(resolve => setTimeout(resolve, 500));

    // Store the result in Redis with the job ID as key
    const redis = getRedisClient();
    const resultKey = `clickatron:job:result:${payload.jobId}`;
    await redis.set(resultKey, JSON.stringify({
      directions,
      generatedAt: new Date().toISOString(),
      jobId: payload.jobId
    }), { ex: 24 * 60 * 60 }); // 24 hours

    // Complete the job with the result reference
    const resultRef = resultKey;
    await completeJob(payload.jobId, resultRef);

    console.log('Direction generation completed for job:', payload.jobId);

    return NextResponse.json({
      success: true,
      jobId: payload.jobId,
      directions: directions,
      resultRef,
    });

  } catch (error) {
    console.error('Error in direction generation worker:', error);

    // Try to fail the job if we have the jobId
    try {
      const body = await request.text();
      const payload = JSON.parse(body);
      if (payload.jobId) {
        await failJob(payload.jobId, {
          code: 'WORKER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown worker error',
        });
      }
    } catch (failError) {
      console.error('Failed to mark job as failed:', failError);
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}