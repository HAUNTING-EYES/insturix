#!/usr/bin/env node
/**
 * Test script to trigger the Cloud Run renderer directly.
 * Usage: node scripts/test-render.mjs
 */

import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment from development.env
const envPath = path.join(__dirname, '..', 'development.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && !key.startsWith('#')) {
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        process.env[key.trim()] = value;
    }
});

const CLOUD_RUN_URL = process.env.REMOTION_CLOUDRUN_URL;
const BUCKET_NAME = process.env.GCS_BUCKET_NAME;

async function testRender() {
    console.log('🎬 Testing Cloud Run Renderer');
    console.log('URL:', CLOUD_RUN_URL);
    console.log('Bucket:', BUCKET_NAME);

    // Parse GCP credentials from env
    const credsBase64 = process.env.GOOGLE_CLOUD_CREDENTIALS;
    if (credsBase64) {
        const credsJson = Buffer.from(credsBase64, 'base64').toString('utf-8');
        const creds = JSON.parse(credsJson);
        process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = credsJson;
    }

    // Create an authentication client
    const auth = new GoogleAuth({
        credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
            ? JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
            : undefined,
    });

    let authHeader = '';
    try {
        const client = await auth.getIdTokenClient(CLOUD_RUN_URL);
        const headers = await client.getRequestHeaders();
        authHeader = headers['Authorization'] || '';
        console.log('✅ Got auth token');
    } catch (e) {
        console.warn('⚠️ Could not get ID token, trying without auth:', e.message);
    }

    // Minimal test payload - just render a blank composition
    const payload = {
        id: 'TestComponent', // Composition ID from constants.ts COMP_NAME
        inputProps: {
            overlays: [],
            durationInFrames: 30, // 1 second at 30fps
            fps: 30,
            width: 1080,
            height: 1080,
        },
        bucketName: BUCKET_NAME,
        outName: `renders/test-${Date.now()}.mp4`,
    };

    console.log('\n📤 Sending render request...');
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const startTime = Date.now();

    try {
        const response = await fetch(`${CLOUD_RUN_URL}/render`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(authHeader ? { Authorization: authHeader } : {}),
            },
            body: JSON.stringify(payload),
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`\n❌ Render failed (${elapsed}s):`, response.status, errorText);
            process.exit(1);
        }

        const data = await response.json();
        console.log(`\n✅ Render complete in ${elapsed}s!`);
        console.log('Result:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('\n❌ Request failed:', error.message);
        process.exit(1);
    }
}

testRender();
