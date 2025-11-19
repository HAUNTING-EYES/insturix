import express, { Request, Response } from 'express';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { Storage } from '@google-cloud/storage';
import path from 'path';
import fs from 'fs';
import os from 'os';

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

const storage = new Storage();

app.post('/render', async (req: Request, res: Response) => {
  try {
    const { id, inputProps, bucketName, outName } = req.body;

    if (!id || !bucketName) {
      return res.status(400).json({ error: 'Missing required fields: id, bucketName' });
    }

    console.log(`Starting render for composition: ${id}`);

    // 1. Bundle the composition
    // We assume the entry point is at ../src/index.ts relative to this service when deployed
    // However, for a standalone service, we might need to copy the src into this directory or mount it.
    // For this implementation, we'll assume the user's src code is copied into the container at build time
    // or we need to point to the correct entry point.
    
    // CRITICAL: In a real deployment, the Remotion project source needs to be available.
    // Since we are building a separate container, we should copy the main project's src into this container.
    // For now, let's assume the 'src' directory is copied to './src' in the container.
    
    // We copied 'app' and 'components' etc.
    // Found the entry point at components/editor/version-7.0.0/remotion/index.ts
    const entryPoint = path.join(__dirname, '../components/editor/version-7.0.0/remotion/index.ts');
    
    console.log('Bundling...');
    const bundled = await bundle({
      entryPoint,
      // If you have a webpack config, you might need to pass it here
    });

    console.log('Selecting composition...');
    const composition = await selectComposition({
      serveUrl: bundled,
      id,
      inputProps,
    });

    const tmpDir = os.tmpdir();
    const outputFile = path.join(tmpDir, outName || `render-${Date.now()}.mp4`);

    console.log('Rendering...');
    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: 'h264',
      outputLocation: outputFile,
      inputProps,
    });

    console.log('Uploading to GCS...');
    const bucket = storage.bucket(bucketName);
    const destination = outName || `renders/${Date.now()}.mp4`;
    
    await bucket.upload(outputFile, {
      destination,
    });

    // Get public URL (assuming bucket is public or we generate a signed URL)
    // For now, return the GCS URI
    const gcsUri = `gs://${bucketName}/${destination}`;
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;

    // Clean up
    fs.unlinkSync(outputFile);

    console.log('Render complete!');
    res.json({ success: true, gcsUri, publicUrl });

  } catch (error: any) {
    console.error('Render failed:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Renderer service listening on port ${port}`);
});
