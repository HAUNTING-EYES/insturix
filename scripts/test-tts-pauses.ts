import dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables
const envPaths = ['development.env', '.env', 'preview.env'];
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    console.log(`Loaded env from ${p}`);
    break;
  }
}

async function testPauses() {
  // Use dynamic import so that generateVoiceover is only loaded AFTER dotenv.config()
  const { generateVoiceover } = await import('../lib/pipeline/tts-service');

  // A script with all the punctuation marks mapped in tts-config.ts
  const text = "Hello, world! ... This is a test—with multiple marks. How are you? Wow! \n\n New paragraph here: it works.";
  
  console.log("--- TTS Pause Test ---");
  console.log("Text:", text);
  console.log("Voice: kokoro-heart");
  console.log("----------------------");

  try {
    const startTime = Date.now();
    const result = await generateVoiceover(text, 'test-user-id', {
      voice: 'kokoro-heart',
      contentType: 'conversational'
    });
    const endTime = Date.now();

    console.log("\n✅ Generation Successful!");
    console.log(`Total Time taken: ${((endTime - startTime) / 1000).toFixed(2)}s`);
    console.log(`Audio Duration: ${(result.durationMs / 1000).toFixed(2)}s`);
    console.log(`Audio URL: ${result.audioUrl}`);
    console.log("\nListen to the audio and check if the pauses sound natural according to the mappings.");
  } catch (err: any) {
    console.error("\n❌ Test Failed!");
    console.error(err.message);
  }
}

testPauses();
