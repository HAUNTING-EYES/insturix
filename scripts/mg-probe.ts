// Untracked verification helper — probes editron_prev for MG overlay payloads + project inventory.
// Goal: confirm motion-graphic overlays carry contentSignals + resolvedTokens + recipe (with element roles),
// and inventory which real projects have MG overlays + their content type, for a real-data sweep.
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI ?? '';
if (!uri) {
  throw new Error('MONGODB_URI is required to run scripts/mg-probe.ts');
}
const FOCUS_PID = 'proj_K_0-dSCJ76z4';

function contentTypeOf(p: any): string {
  return (
    p.contentType || p.content_type || p.genre || p.profile || p.editProfile ||
    p.detectedProfile || p.brief?.contentType || p.creativeBrief?.contentType ||
    p.metadata?.contentType || 'unknown'
  );
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('editron_prev');

  // ── 1. Full dump of one MG overlay from the focus project ──
  const focus = await db.collection('projects').findOne({ projectId: FOCUS_PID });
  if (focus) {
    const mgs = (focus.overlays || []).filter((o: any) => o.type === 'motion-graphic');
    console.log(`=== FOCUS ${FOCUS_PID}: ${mgs.length} MG overlays ===`);
    const o = mgs[0];
    if (o) {
      console.log('--- overlay[0] top-level keys:', Object.keys(o).join(', '));
      console.log('--- content:', JSON.stringify(o.content));
      console.log('--- contentSignals present:', !!o.contentSignals, 'keys:',
        o.contentSignals ? Object.keys(o.contentSignals).length : 0);
      console.log('--- contentSignals:', JSON.stringify(o.contentSignals));
      console.log('--- resolvedTokens present:', !!o.resolvedTokens, 'keys:',
        o.resolvedTokens ? Object.keys(o.resolvedTokens).join(',') : 'none');
      console.log('--- recipe.id:', o.recipe?.id, '| layout:', JSON.stringify(o.recipe?.layout),
        '| exitStyle:', o.recipe?.exitStyle);
      console.log('--- recipe.elements roles:',
        (o.recipe?.elements || []).map((e: any) => `${e.role}(${e.type})`).join(', '));
      // any structural-move (sm-*) roles present in stored recipes across all MGs?
      const smRoles = new Set<string>();
      mgs.forEach((m: any) => (m.recipe?.elements || []).forEach((e: any) => {
        if (typeof e.role === 'string' && e.role.startsWith('sm-')) smRoles.add(e.role);
      }));
      console.log('--- structural-move roles across all stored MGs:', smRoles.size ? [...smRoles].join(', ') : 'NONE');
      // element-count distribution across stored MGs
      const counts: Record<number, number> = {};
      mgs.forEach((m: any) => { const n = m.recipe?.elements?.length ?? -1; counts[n] = (counts[n] || 0) + 1; });
      console.log('--- element-count distribution:', JSON.stringify(counts));
    }
  } else {
    console.log(`FOCUS ${FOCUS_PID} NOT FOUND`);
  }

  // ── 2. Inventory: projects with MG overlays, by content type ──
  console.log('\n=== PROJECT INVENTORY (projects with >=1 motion-graphic overlay) ===');
  const projects = await db.collection('projects')
    .find({}, { projection: { projectId: 1, overlays: 1, contentType: 1, genre: 1, profile: 1,
      editProfile: 1, detectedProfile: 1, status: 1, aspectRatio: 1, updatedAt: 1, createdAt: 1 } })
    .toArray();

  const rows: any[] = [];
  for (const p of projects) {
    const ovs = p.overlays || [];
    const mg = ovs.filter((o: any) => o.type === 'motion-graphic');
    if (mg.length === 0) continue;
    // shape-kind / recipe-id distribution for this project
    const recipeIds: Record<string, number> = {};
    const hasSignals = mg.filter((m: any) => m.contentSignals && Object.keys(m.contentSignals).length > 0).length;
    mg.forEach((m: any) => { const id = m.recipe?.id || 'none'; recipeIds[id] = (recipeIds[id] || 0) + 1; });
    rows.push({
      pid: p.projectId,
      ct: contentTypeOf(p),
      status: p.status,
      ar: p.aspectRatio,
      mgCount: mg.length,
      mgWithSignals: hasSignals,
      recipeIds,
      updated: p.updatedAt || p.createdAt,
    });
  }
  rows.sort((a, b) => (b.updated > a.updated ? 1 : -1));
  console.log(`Total projects: ${projects.length} | with MG overlays: ${rows.length}\n`);
  for (const r of rows) {
    console.log(
      `${r.pid}  ct=${r.ct}  status=${r.status}  ar=${r.ar}  MG=${r.mgCount}(sig:${r.mgWithSignals})  ` +
      `recipes=${JSON.stringify(r.recipeIds)}  upd=${r.updated ? new Date(r.updated).toISOString().slice(0, 10) : '?'}`,
    );
  }

  await client.close();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
