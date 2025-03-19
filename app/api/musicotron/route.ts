import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

const SUNO_API_KEY = process.env.SUNO;
const SUNO_API_URL = 'https://apibox.erweima.ai/api/v1/generate';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const headersList = await headers();
    const host = headersList.get('host');
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    
    // Construct the callback URL using the current host
    const callbackUrl = `${protocol}://${host}/api/musicotron/callback`;
    
    // Prepare the request payload based on custom mode
    const payload = {
      prompt: body.customMode ? body.lyrics : body.songDescription,
      style: body.customMode ? body.style : undefined,
      title: body.customMode ? body.title : undefined,
      customMode: body.customMode,
      instrumental: body.instrumental,
      model: 'V3_5',
      negativeTags: '',
      callBackUrl: callbackUrl
    };

    console.log('Sending request to:', SUNO_API_URL);
    console.log('With payload:', JSON.stringify(payload, null, 2));
    console.log('Callback URL:', callbackUrl);

    const response = await fetch(SUNO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUNO_API_KEY}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let errorMessage = 'Failed to generate music';
      try {
        const errorData = await response.json();
        console.log('Error response:', errorData);
        errorMessage = errorData.msg || errorMessage;
      } catch (e) {
        console.log('Error parsing response:', e);
        errorMessage = response.statusText || errorMessage;
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Success response:', data);
    return NextResponse.json({
      taskId: data.task_id,
      message: 'Music generation started'
    });
  } catch (error) {
    console.error('Error generating music:', error);
    return NextResponse.json(
      { error: 'Failed to generate music' },
      { status: 500 }
    );
  }
} 