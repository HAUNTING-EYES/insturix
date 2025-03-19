import { NextResponse } from 'next/server';

const SUNO_API_KEY = process.env.SUNO;
const SUNO_API_URL = 'https://apibox.erweima.ai/api/v1/generate';

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
    const response = await fetch(`${SUNO_API_URL}/callback/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${SUNO_API_KEY}`,
        'Accept': 'application/json'
      }
    });

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
    console.log('Status response data:', data);
    
    // Check task status based on the callback data structure
    if (data.code === 200) {
      if (data.data?.callbackType === 'complete' && Array.isArray(data.data.data)) {
        return NextResponse.json({
          status: 'complete',
          data: data.data.data.map((item: {
            id: string;
            audio_url: string;
            source_audio_url: string;
            stream_audio_url: string;
            source_stream_audio_url: string;
            image_url: string;
            source_image_url: string;
            prompt: string;
            model_name: string;
            title: string;
            tags: string[];
            createTime: string;
            duration: number;
          }) => ({
            id: item.id,
            audio_url: item.audio_url,
            source_audio_url: item.source_audio_url,
            stream_audio_url: item.stream_audio_url,
            source_stream_audio_url: item.source_stream_audio_url,
            image_url: item.image_url,
            source_image_url: item.source_image_url,
            prompt: item.prompt,
            model_name: item.model_name,
            title: item.title,
            tags: item.tags,
            createTime: item.createTime,
            duration: item.duration
          }))
        });
      } else if (data.data?.callbackType === 'first') {
        return NextResponse.json({
          status: 'pending',
          message: 'First track complete, generating remaining tracks...'
        });
      } else if (data.data?.callbackType === 'text') {
        return NextResponse.json({
          status: 'pending',
          message: 'Text generation complete, generating audio...'
        });
      } else {
        return NextResponse.json({
          status: 'pending',
          message: data.msg || 'Task is still processing'
        });
      }
    } else if (data.code === 500) {
      return NextResponse.json({
        status: 'failed',
        error: data.msg || 'Task failed'
      });
    } else {
      return NextResponse.json({
        status: 'pending',
        message: data.msg || 'Task is still processing'
      });
    }

  } catch (error) {
    console.error('Error checking task status:', error);
    return NextResponse.json(
      { error: 'Failed to check task status' },
      { status: 500 }
    );
  }
} 