import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';

console.log('=== 🔧 VERTEX AI SERVICE LOADING ===');

// Check credentials
if (!process.env.GOOGLE_CLOUD_CREDENTIALS) {
  console.error('❌ GOOGLE_CLOUD_CREDENTIALS not set in environment');
  console.log('Current env vars with "GOOGLE":', Object.keys(process.env).filter(k => k.includes('GOOGLE')));
} else {
  console.log('✅ GOOGLE_CLOUD_CREDENTIALS is set');
  console.log('Credentials length:', process.env.GOOGLE_CLOUD_CREDENTIALS.length);
}

let vertexAI: any = null;
let credentials;

try {
  if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
    // Decode base64 credentials
    console.log('🔧 Decoding credentials...');
    const decoded = Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString();
    console.log('Decoded length:', decoded.length);
    
    credentials = JSON.parse(decoded);
    console.log('✅ Credentials parsed');
    console.log('Project ID:', credentials.project_id);
    console.log('Client email:', credentials.client_email?.substring(0, 20) + '...');
    
    vertexAI = new VertexAI({
      project: credentials.project_id,
      location: 'us-central1',
      credentials,
    });
    console.log('✅ VertexAI client created');
  } else {
    console.log('⚠️ Using mock VertexAI (no credentials)');
  }
} catch (error) {
  console.error('❌ Failed to initialize VertexAI:', error);
  console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
}

const model = 'gemini-1.5-flash';

export async function analyzeVideoWithGemini(videoUrl: string, context: any, metadata: any) {
  console.log('\n=== 🎬 VERTEX AI ANALYSIS START ===');
  console.log('Video URL:', videoUrl);
  console.log('Context:', context);
  console.log('Metadata:', metadata);
  console.log('VertexAI initialized:', !!vertexAI);
  
  // If no VertexAI client, return mock data
  if (!vertexAI) {
    console.log('⚠️ No VertexAI client, returning mock data');
    return getMockAnalysis(context, metadata);
  }

  try {
    console.log('🔧 Creating generative model...');
    const generativeModel = vertexAI.getGenerativeModel({
      model,
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.4,
        topP: 0.95,
        topK: 40,
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ],
    });
    
    console.log('✅ Generative model created');

    // Create analysis prompt
    const prompt = `
    Analyze this video and provide a structured JSON response.
    
    VIDEO METADATA:
    - Duration: ${metadata.videoDuration} seconds
    - Title: ${metadata.originalFilename}
    
    USER CONTEXT:
    - Niche: ${context.niche}
    - Audience: ${context.audience}
    - Tone: ${context.tone}
    - Additional Details: ${context.additionalDetails || 'None'}
    
    Return a valid JSON object with this structure:
    {
      "summary": "string",
      "keyMoments": [{"timestamp": "string", "description": "string"}],
      "qualityAssessment": {"score": number, "notes": "string"},
      "recommendations": ["string"],
      "contentWarnings": ["string"],
      "analysisTime": "ISO timestamp"
    }
    `;

    console.log('📝 Prompt created (length:', prompt.length, 'chars)');
    console.log('🔧 Making Vertex AI API call...');
    
    const request = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
    };

    const result = await generativeModel.generateContent(request);
    console.log('✅ Vertex AI API call succeeded');
    
    const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    console.log('Response text length:', responseText.length);
    
    try {
      const parsed = JSON.parse(responseText);
      console.log('✅ JSON parsed successfully');
      return parsed;
    } catch (parseError) {
      console.error('❌ Failed to parse JSON:', parseError);
      console.log('Response preview:', responseText.substring(0, 200));
      return {
        summary: responseText.substring(0, 500),
        analysisTime: new Date().toISOString(),
        parseError: true
      };
    }
    
  } catch (error) {
    console.error('❌ Vertex AI analysis failed:', error);
    console.error('Error name:', error instanceof Error ? error.name : 'Unknown');
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    
    // Return mock data as fallback
    console.log('🔄 Falling back to mock analysis');
    return getMockAnalysis(context, metadata);
  }
}

function getMockAnalysis(context: any, metadata: any) {
  console.log('🎭 Generating mock analysis');
  return {
    summary: `Mock analysis for "${metadata?.originalFilename || 'video'}" targeting ${context.audience} in ${context.niche} niche`,
    keyMoments: [
      { timestamp: '00:30', description: 'Introduction to topic' },
      { timestamp: '01:45', description: 'Key demonstration or example' },
      { timestamp: '03:20', description: 'Conclusion and summary' }
    ],
    qualityAssessment: {
      score: 8,
      notes: 'Good production quality with clear audio and visuals'
    },
    recommendations: [
      'Add chapter markers for key sections',
      'Include more visual examples',
      'Improve lighting in outdoor shots'
    ],
    contentWarnings: [],
    analysisTime: new Date().toISOString(),
    modelUsed: 'gemini-1.5-flash-mock',
    mock: true
  };
}