/**
 * Pre-production test: Gemma 4 + Gemini Files API
 *
 * Tests whether gemma-4-31b-it can use the Files API to analyze video content.
 * This is critical because five-track-analysis.ts uploads videos via Files API
 * and we switched the default analysis model to Gemma 4.
 *
 * Expected outcomes:
 *   SUCCESS → Gemma 4 supports Files API, no fallback needed
 *   404/NOT_FOUND → Gemma 4 doesn't support Files API, fallback activates in production
 *   Other error → investigate before deploying
 *
 * Usage:
 *   npx tsx scripts/test-gemma4-files-api.ts
 */

export {};

async function main() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('❌ No GEMINI_API_KEY or GOOGLE_API_KEY found in environment');
    process.exit(1);
  }

  console.log('🧪 Testing Gemma 4 + Files API compatibility\n');

  // ─── Step 1: Test basic text generation with Gemma 4 ──────────
  console.log('Step 1: Basic text generation with gemma-4-31b-it...');
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemma-4-31b-it' });

    const result = await model.generateContent('Say "hello" and nothing else.');
    const text = result.response.text();
    console.log(`  ✅ Text generation works. Response: "${text.trim().substring(0, 50)}"`);
  } catch (err: any) {
    console.error(`  ❌ Text generation FAILED: ${err.message}`);
    console.error(`     Status: ${err.status || err.statusCode || 'unknown'}`);
    if (err.message?.toLowerCase().includes('not found') || err.status === 404) {
      console.error('  ⚠️  Model not found — Gemma 4 may not be available on your API key.');
      console.error('     Check: https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api');
    }
    process.exit(1);
  }

  // ─── Step 2: Test vision (image) with Gemma 4 ─────────────────
  console.log('\nStep 2: Vision (image analysis) with gemma-4-31b-it...');
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemma-4-31b-it' });

    // Create a tiny 1x1 red PNG (minimal test image)
    const tinyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64'
    );

    const result = await model.generateContent([
      { text: 'What color is this image? Reply with just the color name.' },
      { inlineData: { mimeType: 'image/png', data: tinyPng.toString('base64') } },
    ]);
    const text = result.response.text();
    console.log(`  ✅ Vision works. Response: "${text.trim().substring(0, 50)}"`);
  } catch (err: any) {
    console.error(`  ❌ Vision FAILED: ${err.message}`);
    console.error(`     Status: ${err.status || err.statusCode || 'unknown'}`);
    console.log('  ⚠️  Gemma 4 may not support vision. Fallback to gemini-2.5-flash will activate.');
  }

  // ─── Step 3: Test Files API upload with Gemma 4 ───────────────
  console.log('\nStep 3: Files API upload + analysis with gemma-4-31b-it...');
  try {
    const { GoogleAIFileManager } = await import('@google/generative-ai/server');
    const fileManager = new GoogleAIFileManager(apiKey);

    // We need a real video file to test Files API.
    // Use a tiny MP4 file — create minimal valid MP4
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');

    // Check if we have any video file to test with
    const testVideoPath = path.join(os.tmpdir(), 'test-gemma4.mp4');

    // Create a minimal MP4 file (ftyp + moov atoms — smallest valid MP4)
    // This is a 0-frame MP4 that the Files API should accept
    const minimalMp4 = Buffer.from([
      // ftyp box (file type)
      0x00, 0x00, 0x00, 0x14, // size: 20
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x69, 0x73, 0x6F, 0x6D, // 'isom'
      0x00, 0x00, 0x02, 0x00, // version
      0x69, 0x73, 0x6F, 0x6D, // compatible brand 'isom'
      // moov box (movie)
      0x00, 0x00, 0x00, 0x08, // size: 8
      0x6D, 0x6F, 0x6F, 0x76, // 'moov'
    ]);
    fs.writeFileSync(testVideoPath, minimalMp4);

    console.log('  Uploading test video to Files API...');
    const uploadResult = await fileManager.uploadFile(testVideoPath, {
      mimeType: 'video/mp4',
      displayName: 'test-gemma4-compatibility',
    });
    console.log(`  Upload OK: ${uploadResult.file.name}, state: ${uploadResult.file.state}`);

    // Wait for file to be active
    let file = uploadResult.file;
    let attempts = 0;
    while (file.state === 'PROCESSING' && attempts < 10) {
      await new Promise(r => setTimeout(r, 2000));
      file = await fileManager.getFile(file.name);
      attempts++;
    }
    console.log(`  File state: ${file.state} (after ${attempts} polls)`);

    if (file.state === 'ACTIVE') {
      // Now try to use Gemma 4 with the uploaded file
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemma-4-31b-it' });

      console.log('  Calling gemma-4-31b-it with file reference...');
      const result = await model.generateContent([
        { text: 'Describe what you see in this video. If you cannot analyze it, say "cannot analyze".' },
        { fileData: { mimeType: 'video/mp4', fileUri: file.uri } },
      ]);
      const text = result.response.text();
      console.log(`  ✅ FILES API + GEMMA 4 WORKS! Response: "${text.trim().substring(0, 100)}"`);
    } else {
      console.log(`  ⚠️  File stuck in ${file.state} state — Files API may not accept this test file.`);
      console.log('     This doesn\'t mean Gemma 4 is incompatible — the test video may be too small.');
    }

    // Cleanup
    try {
      await fileManager.deleteFile(file.name);
      fs.unlinkSync(testVideoPath);
    } catch {}

  } catch (err: any) {
    const msg = err.message || '';
    const status = err.status || err.statusCode || err.code || 'unknown';
    console.error(`  ❌ Files API FAILED: ${msg}`);
    console.error(`     Status: ${status}`);

    // Classify the error
    const isModelError = msg.toLowerCase().includes('not found')
      || msg.toLowerCase().includes('unsupported')
      || msg.toLowerCase().includes('does not support')
      || msg.toLowerCase().includes('invalid model')
      || status === 404;

    if (isModelError) {
      console.log('\n  📋 VERDICT: Gemma 4 does NOT support Files API.');
      console.log('     The withAnalysisFallback() in gemini-model-factory.ts will');
      console.log('     automatically fall back to gemini-2.5-flash for video analysis.');
      console.log('     Text-only analysis (parsing, subject extraction) will still use Gemma 4.');
    } else {
      console.log('\n  📋 VERDICT: Error is NOT model-related (might be auth, quota, or file format).');
      console.log('     Investigate before deploying. Error does NOT indicate Gemma 4 incompatibility.');
    }
  }

  // ─── Step 4: Test fallback behavior ───────────────────────────
  console.log('\nStep 4: Testing gemini-2.5-flash (fallback model) text generation...');
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContent('Say "fallback works" and nothing else.');
    const text = result.response.text();
    console.log(`  ✅ Fallback model works. Response: "${text.trim().substring(0, 50)}"`);
  } catch (err: any) {
    console.error(`  ❌ Fallback ALSO failed: ${err.message}`);
    console.error('     Both primary AND fallback models are broken. Check API key.');
  }

  console.log('\n🏁 Test complete.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
