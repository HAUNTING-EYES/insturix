/**
 * Clickatron Endpoint Verification Script
 * This script tests the full lifecycle of a Clickatron session.
 * 
 * Usage:
 * $env:BASE_URL="http://localhost:3000"
 * $env:CLERK_TOKEN="your_jwt_here"
 * npx tsx tests/clickatron/endpoint-verification.ts
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CLERK_TOKEN = process.env.CLERK_TOKEN;

if (!CLERK_TOKEN) {
    console.error('Error: CLERK_TOKEN environment variable is required.');
    process.exit(1);
}

const headers = {
    'Authorization': `Bearer ${CLERK_TOKEN}`,
};

async function testPromptEnhancement() {
    console.log('\n--- 1. Testing Prompt Enhancement ---');
    const response = await fetch(`${BASE_URL}/api/services/clickatron/enhance-prompt`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: 'a futuristic city with neon lights',
            taskType: 'imageGeneration'
        })
    });
    const data = await response.json();
    if (response.ok) {
        console.log('✓ Prompt Enhanced:', data.enhancedPrompt.substring(0, 50) + '...');
        return data.enhancedPrompt;
    } else {
        console.error('✗ Prompt Enhancement Failed:', data);
        throw new Error('Step 1 failed');
    }
}

async function testCreateSession(enhancedPrompt: string) {
    console.log('\n--- 2. Testing Session Creation ---');
    const formData = new FormData();
    formData.append('prompt', enhancedPrompt);
    formData.append('aspectRatio', '16:9');
    formData.append('modelId', 'fal-ai/flux/dev');

    const response = await fetch(`${BASE_URL}/api/services/clickatron/session`, {
        method: 'POST',
        headers: { ...headers }, // Fetch handles FormData Content-Type automatically
        body: formData as any
    });
    const data = await response.json();
    if (response.ok) {
        console.log('✓ Session Created. ID:', data.sessionId);
        return data.sessionId;
    } else {
        console.error('✗ Session Creation Failed:', data);
        throw new Error('Step 2 failed');
    }
}

async function testGetSession(sessionId: string) {
    console.log('\n--- 3. Testing Get Session ---');
    const response = await fetch(`${BASE_URL}/api/services/clickatron/session/${sessionId}`, {
        headers
    });
    const data = await response.json();
    if (response.ok) {
        console.log('✓ Session Retrieved. Variations:', data.session.details.canvas.variations.length);
        return data.session;
    } else {
        console.error('✗ Get Session Failed:', data);
        throw new Error('Step 3 failed');
    }
}

async function testChat(sessionId: string) {
    console.log('\n--- 4. Testing Chat Interaction ---');
    // POST Message
    const postResponse = await fetch(`${BASE_URL}/api/services/clickatron/session/${sessionId}/chat`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Make it look more cyberpunk' })
    });
    const postData = await postResponse.json();
    if (postResponse.ok) {
        console.log('✓ Chat Message Sent. ID:', postData.messageId);
    } else {
        console.error('✗ Post Chat Failed:', postData);
        throw new Error('Step 4a failed');
    }

    // GET History
    const getResponse = await fetch(`${BASE_URL}/api/services/clickatron/session/${sessionId}/chat`, {
        headers
    });
    const getData = await getResponse.json();
    if (getResponse.ok) {
        console.log('✓ Chat History Retrieved. Count:', getData.chatHistory.length);
    } else {
        console.error('✗ Get Chat Failed:', getData);
        throw new Error('Step 4b failed');
    }
}

async function testCreateVariation(sessionId: string) {
    console.log('\n--- 5. Testing Variation Generation ---');
    const formData = new FormData();
    formData.append('prompt', 'Add some flying cars in the background');
    formData.append('aspectRatio', '16:9');
    formData.append('modelId', 'fal-ai/flux/dev');

    const response = await fetch(`${BASE_URL}/api/services/clickatron/session/${sessionId}/variation`, {
        method: 'POST',
        headers: { ...headers },
        body: formData as any
    });
    const data = await response.json();
    if (response.ok) {
        console.log('✓ Variation Queued. Job ID:', data.jobId);
        return data.variationId;
    } else {
        console.error('✗ Variation Generation Failed:', data);
        throw new Error('Step 5 failed');
    }
}

async function testSyncCanvas(sessionId: string, sessionData: any) {
    console.log('\n--- 6. Testing Canvas Synchronization ---');
    // Add a fake variation locally and sync
    const updatedCanvas = {
        ...sessionData.details.canvas,
        variations: [
            ...sessionData.details.canvas.variations,
            {
                id: 'local_var_test',
                prompt: 'Test sync',
                status: 'blank',
                aspectRatio: '16:9',
                fineTuning: { brightness: 100, contrast: 120, saturation: 110 },
                createdAt: new Date(),
                updatedAt: new Date(),
                imageRef: ''
            }
        ]
    };

    const response = await fetch(`${BASE_URL}/api/services/clickatron/session/${sessionId}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvas: updatedCanvas })
    });
    const data = await response.json();
    if (response.ok) {
        console.log('✓ Canvas Synced Successfully');
    } else {
        console.error('✗ Canvas Sync Failed:', data);
        throw new Error('Step 6 failed');
    }
}

async function testUserHistory() {
    console.log('\n--- 7. Testing User History ---');
    const response = await fetch(`${BASE_URL}/api/services/clickatron/history?limit=10`, {
        headers
    });
    const data = await response.json();
    if (response.ok) {
        console.log('✓ History Retrieved. Total sessions:', data.total);
    } else {
        console.error('✗ History Failed:', data);
        throw new Error('Step 7 failed');
    }
}

async function testDeleteSession(sessionId: string) {
    console.log('\n--- 8. Testing Session Deletion ---');
    const response = await fetch(`${BASE_URL}/api/services/clickatron/session/${sessionId}/delete`, {
        method: 'DELETE',
        headers
    });
    const data = await response.json();
    if (response.ok) {
        console.log('✓ Session Deleted Successfully.');
    } else {
        console.error('✗ Session Deletion Failed:', data);
        throw new Error('Step 8 failed');
    }
}

async function runAllTests() {
    console.log('Starting Clickatron API Verification...');
    console.log(`Targeting: ${BASE_URL}`);

    try {
        const enhancedPrompt = await testPromptEnhancement();
        const sessionId = await testCreateSession(enhancedPrompt);
        const sessionData = await testGetSession(sessionId);
        await testChat(sessionId);
        await testCreateVariation(sessionId);
        await testSyncCanvas(sessionId, sessionData);
        await testUserHistory();
        await testDeleteSession(sessionId);

        console.log('\n=====================================');
        console.log('🎉 ALL ENDPOINT TESTS PASSED SUCCESSFULLY');
        console.log('=====================================');
    } catch (err) {
        console.error('\n❌ VERIFICATION FAILED');
        process.exit(1);
    }
}

runAllTests();

export {};
