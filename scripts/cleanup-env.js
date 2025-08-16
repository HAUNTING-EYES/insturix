#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');

try {
  // Remove the temporary .env file if it exists
  if (fs.existsSync(envPath)) {
    fs.unlinkSync(envPath);
    console.log('✅ Cleaned up temporary .env file');
  }
} catch (error) {
  console.error('Error cleaning up .env file:', error.message);
}