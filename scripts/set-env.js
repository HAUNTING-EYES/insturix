#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const envFile = process.argv[2];

if (!envFile) {
  console.error('Error: Please specify an environment file');
  console.log('Usage: node scripts/set-env.js <env-file> <command>');
  console.log('Example: node scripts/set-env.js .env.preview next dev --turbopack');
  process.exit(1);
}

const validFiles = ['development.env', 'preview.env', 'production.env'];
if (!validFiles.includes(envFile)) {
  console.error(`Error: Invalid environment file. Must be one of: ${validFiles.join(', ')}`);
  process.exit(1);
}

const envPath = path.resolve(process.cwd(), envFile);
const targetEnvPath = path.resolve(process.cwd(), '.env');
const cleanupScriptPath = path.resolve(process.cwd(), 'scripts/cleanup-env.js');

// Function to cleanup the temporary .env file
function cleanup() {
  try {
    if (fs.existsSync(targetEnvPath)) {
      fs.unlinkSync(targetEnvPath);
      console.log('✅ Cleaned up temporary .env file');
    }
  } catch (error) {
    console.error('Error cleaning up .env file:', error.message);
  }
}

try {
  // Check if the source environment file exists
  if (!fs.existsSync(envPath)) {
    console.error(`Error: Environment file not found: ${envFile}`);
    process.exit(1);
  }

  // Remove existing .env if it exists
  if (fs.existsSync(targetEnvPath)) {
    fs.unlinkSync(targetEnvPath);
  }

  // Copy the environment file to .env (takes highest precedence)
  fs.copyFileSync(envPath, targetEnvPath);
  console.log(`✅ Copied ${envFile} to .env`);

  // Set NODE_ENV based on the file name (using standard values)
  let nodeEnv = 'development';
  if (envFile === '.env.preview') nodeEnv = 'development'; // Use development for preview
  if (envFile === '.env.production') nodeEnv = 'production';

  // Run the appropriate command
  const commandArgs = process.argv.slice(3);
  if (commandArgs.length === 0) {
    console.error('Error: Please specify a command to run');
    cleanup();
    process.exit(1);
  }

  const command = commandArgs[0];
  const args = commandArgs.slice(1);

  console.log(`🚀 Running: ${command} ${args.join(' ')}`);
  
  // Set the NODE_ENV environment variable
  const env = { ...process.env, NODE_ENV: nodeEnv };
  
  // Spawn the command as a child process
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: env
  });

  // Handle process exit
  child.on('close', (code) => {
    cleanup();
    process.exit(code);
  });

  // Handle process signals for cleanup
  process.on('SIGINT', () => {
    child.kill('SIGINT');
    cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
    cleanup();
    process.exit(0);
  });

} catch (error) {
  cleanup();
  console.error('Error:', error.message);
  process.exit(1);
}