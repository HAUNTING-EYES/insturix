import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import * as dotenv from 'dotenv';
dotenv.config({ path: 'd:/insturix/prod/Front-End/.env.local' });
dotenv.config({ path: 'd:/insturix/prod/Front-End/.env' });

const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
const model = google('gemini-2.5-flash');

async function run() {
    const result = await generateText({
        model,
        prompt: 'suggest funny hooks for this video about ksi and carryminati try not to laugh. Provide links to videos.',
        maxOutputTokens: 1000,
        tools: {
            google_search: google.tools.googleSearch({}),
        },
    });

    const providerMeta = (result as any).experimental_providerMetadata ?? result.providerMetadata;
    console.log('Provider Metadata:', JSON.stringify(providerMeta, null, 2));

    let googleMeta = providerMeta?.google;
    if (providerMeta && !googleMeta && ('@ai-sdk/google' in providerMeta)) {
        googleMeta = providerMeta['@ai-sdk/google'];
    }

    console.log('Result text:', result.text);
    console.log('Google Meta:', JSON.stringify(googleMeta, null, 2));
}

run().catch(console.error);
