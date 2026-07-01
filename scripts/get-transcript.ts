import { MongoClient } from 'mongodb';
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('Set MONGODB_URI to run this probe (do not hardcode credentials).');
const client = new MongoClient(uri);
const PID = 'proj_K_0-dSCJ76z4';

async function run() {
  await client.connect();
  const db = client.db('editron_prev');
  const proj = await db.collection('projects').findOne({ projectId: PID });
  if (!proj) { console.log('NOT FOUND'); await client.close(); return; }

  // Extract transcript from caption overlays
  const caps = (proj.overlays || []).filter((o: any) => o.type === 'caption');
  const allSentences: string[] = [];
  caps.forEach((cap: any) => {
    const captions = cap.captions || [];
    captions.forEach((c: any) => {
      if (c.text) allSentences.push(c.text);
    });
  });

  const fullText = allSentences.join(' ');
  console.log('=== TRANSCRIPT ===');
  console.log('Sentences:', allSentences.length);
  console.log('Words:', fullText.split(/\s+/).length);
  console.log('\n--- FULL TEXT (first 2000 chars) ---');
  console.log(fullText.slice(0, 2000));
  console.log('\n--- FULL TEXT (last 500 chars) ---');
  console.log(fullText.slice(-500));

  // Entity extraction
  const nums = fullText.match(/\d+[%$]|\$[\d,.]+|\b\d{2,}\b/g) || [];
  console.log('\n=== NUMBERS:', nums.length > 0 ? nums.slice(0, 20).join(', ') : 'NONE');

  const names = fullText.match(/[A-Z][a-z]+ [A-Z][a-z]+/g) || [];
  console.log('=== NAMES:', [...new Set(names)].slice(0, 15).join(', ') || 'NONE');

  const questions = fullText.match(/[^.!?]*\?/g) || [];
  console.log('=== QUESTIONS:', questions.length);
  questions.slice(0, 8).forEach(q => console.log('  Q:', q.trim().slice(0, 120)));

  // Key quotes (sentences > 15 words that contain strong language)
  const strongWords = /power|important|key|secret|never|always|must|incredible|amazing|terrible|worst|best|remember|truth/i;
  const quotes = allSentences.filter(s => s.split(/\s+/).length > 10 && strongWords.test(s));
  console.log('\n=== QUOTABLE MOMENTS:', quotes.length);
  quotes.slice(0, 5).forEach(q => console.log('  "' + q.trim().slice(0, 120) + '"'));

  // MG overlay summary for reference
  const mg = (proj.overlays || []).filter((o: any) => o.type === 'motion-graphic');
  console.log('\n=== CURRENT MG OVERLAYS ===');
  mg.forEach((o: any, i: number) => {
    const t = (o.content?.text || o.content?.emphasisWord || '???');
    console.log(`  MG[${i}]: frame=${o.from} (${(o.from/30).toFixed(1)}s) text="${t}" recipe=${o.recipe?.id || 'none'}`);
  });

  // Lower third (html-scene)
  const html = (proj.overlays || []).filter((o: any) => o.type === 'html-scene');
  html.forEach((o: any, i: number) => {
    const txt = String(o.content || '').replace(/<[^>]*>/g, '').trim().slice(0, 100);
    console.log(`\n=== HTML OVERLAY[${i}]: frame=${o.from} text="${txt}"`);
  });

  await client.close();
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
