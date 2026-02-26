/**
 * Facebook API & Permission Verification Script
 * This script verifies that the UploaderX Facebook integration is correctly configured.
 * 
 * Usage:
 * 1. Get a Page Access Token from Facebook Graph API Explorer (with all permissions)
 * 2. Run:
 *    $env:FACEBOOK_PAGE_TOKEN="your_token_here"
 *    $env:FACEBOOK_PAGE_ID="your_page_id_here"
 *    npx tsx tests/uploaderx/facebook-verification.ts
 */

import "dotenv/config";

const PAGE_TOKEN = process.env.FACEBOOK_PAGE_TOKEN;
const PAGE_ID = process.env.FACEBOOK_PAGE_ID;

async function verifyFacebookPermissions() {
    console.log('--- Checking Facebook Graph API Permissions ---');

    if (!PAGE_TOKEN) {
        console.error('❌ Error: FACEBOOK_PAGE_TOKEN is missing. Please provide it via environment variable.');
        return;
    }

    try {
        const response = await fetch(`https://graph.facebook.com/v21.0/me/permissions?access_token=${PAGE_TOKEN}`);
        const data = await response.json();

        if (data.error) {
            console.error('❌ Facebook API Error:', data.error.message);
            return;
        }

        const permissions = data.data || [];
        const requiredPermissions = [
            'pages_show_list',
            'pages_read_engagement',
            'pages_manage_posts'
        ];

        console.log('\nCurrent Permissions:');
        permissions.forEach((p: any) => {
            const status = p.status === 'granted' ? '✅' : '❌';
            console.log(`${status} ${p.permission}`);
        });

        const missing = requiredPermissions.filter(rp =>
            !permissions.find((p: any) => p.permission === rp && p.status === 'granted')
        );

        if (missing.length === 0) {
            console.log('\n✨ ALL REQUIRED PERMISSIONS GRANTED!');
        } else {
            console.warn('\n⚠️ MISSING PERMISSIONS:', missing.join(', '));
            console.log('Please add these use cases/permissions in your Meta Dashboard.');
        }
    } catch (err) {
        console.error('❌ Failed to connect to Facebook API:', err);
    }
}

async function verifyPageAccess() {
    if (!PAGE_ID || !PAGE_TOKEN) return;

    console.log(`\n--- Verifying Access to Page ID: ${PAGE_ID} ---`);
    try {
        const response = await fetch(`https://graph.facebook.com/v21.0/${PAGE_ID}?fields=name,about,category&access_token=${PAGE_TOKEN}`);
        const data = await response.json();

        if (data.error) {
            console.error('❌ Page Access Failed:', data.error.message);
        } else {
            console.log('✅ Connected to Page:', data.name);
            console.log('Category:', data.category);
        }
    } catch (err) {
        console.error('❌ Connection error:', err);
    }
}

async function runTests() {
    console.log('Starting Facebook Connection Verification...\n');

    // Check Env
    console.log('Checking .env configuration:');
    console.log(process.env.FACEBOOK_APP_ID ? '✅ FACEBOOK_APP_ID: Found' : '❌ FACEBOOK_APP_ID: Missing');
    console.log(process.env.FACEBOOK_APP_SECRET ? '✅ FACEBOOK_APP_SECRET: Found' : '❌ FACEBOOK_APP_SECRET: Missing');

    await verifyFacebookPermissions();
    await verifyPageAccess();

    console.log('\n=====================================');
    console.log('Verification Complete');
    console.log('=====================================');
}

runTests();
