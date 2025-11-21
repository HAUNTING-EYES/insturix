/**
 * Development Utilities
 * 
 * Helper functions for testing and debugging the cloud migration
 */

import { projectService } from '@/lib/services/project-service';
import { assetResolver } from '@/lib/services/asset-resolver';
import { checkpointService } from '@/lib/services/checkpoint-service';
import type { AspectRatio } from '@/components/editor/version-7.0.0/types';

/**
 * Create a test project with sample data
 */
export async function createTestProject(userId: string) {
  const project = await projectService.createProject(
    userId,
    'Test Project ' + new Date().toISOString()
  );

  console.log('✅ Created test project:', project.projectId);
  return project;
}

/**
 * List all user projects
 */
export async function listUserProjects(userId: string) {
  const result = await projectService.listProjects(userId);
  
  console.log(`📁 Found ${result.total} projects:`);
  result.projects.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.name} (${p.projectId})`);
  });
  
  return result;
}

/**
 * Verify asset ID system is working
 */
export async function testAssetIdSystem() {
  console.log('🧪 Testing Asset ID System...\n');

  // Test URL stripping with a simple mock
  const overlaysWithUrls: any[] = [
    {
      id: 1,
      type: 'video',
      assetId: 'a_test123',
      src: 'https://storage.googleapis.com/very-long-url...',
      from: 0,
      durationInFrames: 300,
    }
  ];

  const stripped = assetResolver.stripUrlsForLLM(overlaysWithUrls as any);
  
  console.log('Original overlay with URL:');
  console.log(JSON.stringify(overlaysWithUrls[0], null, 2));
  
  console.log('\nStripped overlay (no URL):');
  console.log(JSON.stringify(stripped[0], null, 2));
  
  console.log('\n✅ Asset ID system working!');
  console.log(`   Original size: ${JSON.stringify(overlaysWithUrls).length} chars`);
  console.log(`   Stripped size: ${JSON.stringify(stripped).length} chars`);
  console.log(`   Savings: ${Math.round((1 - JSON.stringify(stripped).length / JSON.stringify(overlaysWithUrls).length) * 100)}%`);
}

/**
 * Test checkpoint creation and restoration
 */
export async function testCheckpoints(userId: string, projectId: string) {
  console.log('🧪 Testing Checkpoints...\n');

  const sessionId = 'test_session_' + Date.now();
  
  // Create initial checkpoint
  const checkpoint1 = await checkpointService.createCheckpoint({
    sessionId,
    projectId,
    userId,
    overlays: [],
    description: 'Initial state',
    type: 'initial',
  });
  
  console.log('✅ Created checkpoint 1:', checkpoint1?.checkpointId);

  // Create second checkpoint (should detect no changes)
  const checkpoint2 = await checkpointService.createCheckpoint({
    sessionId,
    projectId,
    userId,
    overlays: [],
    description: 'Same state',
    type: 'user-edit',
  });
  
  console.log('ℹ️  Checkpoint 2 (should be null):', checkpoint2);

  // List checkpoints
  const checkpoints = await checkpointService.getCheckpoints(sessionId);
  console.log(`📋 Found ${checkpoints.length} checkpoints for session`);

  return { sessionId, checkpoints };
}

/**
 * Verify environment variables are set
 */
export function checkEnvironment() {
  console.log('🔍 Checking environment variables...\n');

  const required = [
    'MONGODB_URI',
    'MONGODB_DB_NAME',
    'GOOGLE_CLOUD_CREDENTIALS',
    'GCS_BUCKET_NAME',
  ];

  const missing: string[] = [];
  
  required.forEach(key => {
    const value = process.env[key];
    if (!value) {
      missing.push(key);
      console.log(`❌ ${key}: NOT SET`);
    } else {
      const preview = value.length > 50 
        ? value.substring(0, 47) + '...' 
        : value;
      console.log(`✅ ${key}: ${preview}`);
    }
  });

  if (missing.length > 0) {
    console.log('\n⚠️  Missing environment variables!');
    console.log('   Please set them in .env.local');
    return false;
  }

  console.log('\n✅ All environment variables configured!');
  return true;
}

/**
 * Run all tests
 */
export async function runAllTests(userId: string) {
  console.log('🚀 Running Cloud Migration Tests\n');
  console.log('='.repeat(50) + '\n');

  // 1. Check environment
  checkEnvironment();
  console.log('\n' + '='.repeat(50) + '\n');

  // 2. Test asset ID system
  await testAssetIdSystem();
  console.log('\n' + '='.repeat(50) + '\n');

  // 3. Create test project
  const project = await createTestProject(userId);
  console.log('\n' + '='.repeat(50) + '\n');

  // 4. Test checkpoints
  await testCheckpoints(userId, project.projectId);
  console.log('\n' + '='.repeat(50) + '\n');

  // 5. List projects
  await listUserProjects(userId);
  console.log('\n' + '='.repeat(50) + '\n');

  console.log('🎉 All tests completed!\n');
}

// For console debugging
if (typeof window !== 'undefined') {
  (window as any).devUtils = {
    createTestProject,
    listUserProjects,
    testAssetIdSystem,
    testCheckpoints,
    checkEnvironment,
    runAllTests,
  };
  
  console.log('💡 Dev utilities available at: window.devUtils');
  console.log('   Example: await devUtils.runAllTests("user123")');
}
