import { NextResponse } from 'next/server';

const SUNO_API_KEY = process.env.SUNO_API_KEY;

if (!SUNO_API_KEY) {
  throw new Error('SUNO_API_KEY environment variable is not set');
}
const SUNO_API_URL = 'https://apibox.erweima.ai/api/v1';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 }
      );
    }

    console.log('Checking status for task:', taskId);
    const response = await fetch(`${SUNO_API_URL}/generate/record-info?taskId=${taskId}`, {
      headers: {
        'Authorization': `Bearer ${SUNO_API_KEY}`,
        'Accept': 'application/json'
      }
    });

    if (response.status === 401) {
      console.error('Authentication failed in status check');
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }

    if (response.status === 404) {
      return NextResponse.json({
        status: 'failed',
        error: 'Task not found. The music generation might have failed or timed out.'
      }, { status: 404 });
    }

    if (!response.ok) {
      let errorMessage = 'Failed to check task status';
      try {
        const errorData = await response.json();
        console.log('Status error response:', errorData);
        errorMessage = errorData.msg || errorMessage;
      } catch (e) {
        console.log('Error parsing status response:', e);
        errorMessage = response.statusText || errorMessage;
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Task status response:', data);
    
    if (data.code === 200) {
      if (data.data?.status === 'SUCCESS') {
        const musicData = data.data.response?.sunoData || [];
        return NextResponse.json({
          status: 'complete',
          data: musicData.map((item: any) => ({
            id: item.id,
            audio_url: item.audioUrl,
            source_audio_url: item.sourceAudioUrl,
            stream_audio_url: item.streamAudioUrl,
            source_stream_audio_url: item.sourceStreamAudioUrl,
            image_url: item.imageUrl,
            source_image_url: item.sourceImageUrl,
            prompt: item.prompt,
            model_name: item.modelName,
            title: item.title,
            tags: item.tags,
            createTime: item.createTime?.toString(),
            duration: item.duration
          }))
        });
      } else if (data.data?.status === 'FAILED' || data.data?.errorMessage) {
        return NextResponse.json({
          status: 'failed',
          error: data.data.errorMessage || data.msg || 'Task failed'
        });
      } else {
        return NextResponse.json({
          status: 'pending',
          message: 'Generating your music...'
        });
      }
    }
    
    if (!response.ok) {
      console.error('Error response from task API:', data);
      return NextResponse.json(
        { error: data.msg || 'Failed to check task status' },
        { status: response.status }
      );
    }
    
    return NextResponse.json({
      status: 'pending',
      message: 'Waiting for task status...'
    });

  } catch (error) {
    console.error('Error checking task status:', error);
    return NextResponse.json(
      { error: 'Failed to check task status' },
      { status: 500 }
    );
  }
} 