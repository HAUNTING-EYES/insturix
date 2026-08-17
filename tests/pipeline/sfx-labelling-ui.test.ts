import { afterEach, describe, expect, it } from 'vitest';

import { REVIEWER_PAGE_SCRIPT } from '@/lib/pipeline/sfx-labelling-ui';

/**
 * Minimal DOM shim sufficient to execute the EXACT reviewer page script
 * (REVIEWER_PAGE_SCRIPT) that the dev route embeds. No jsdom dependency.
 */
function makeElement(tag: string) {
  const el: Record<string, unknown> = {
    tagName: tag.toUpperCase(),
    className: '',
    textContent: '',
    children: [] as unknown[],
    dataset: {} as Record<string, string>,
    _listeners: {} as Record<string, Array<() => void>>,
    type: '',
    value: '',
    checked: false,
    rows: 0,
    placeholder: '',
    src: '',
    controls: false,
    preload: '',
    disabled: false,
    appendChild(child: unknown) {
      (this.children as unknown[]).push(child);
      return child;
    },
    addEventListener(type: string, fn: () => void) {
      (this._listeners as Record<string, Array<() => void>>)[type] = (this._listeners as Record<string, Array<() => void>>)[type] || [];
      (this._listeners as Record<string, Array<() => void>>)[type].push(fn);
    },
    fire(type: string) {
      for (const fn of (this._listeners as Record<string, Array<() => void>>)[type] || []) fn();
    },
  };
  return el;
}

function makeDom() {
  const windowObj: Record<string, unknown> = {};
  const documentObj: Record<string, unknown> = {
    createElement: (tag: string) => makeElement(tag),
    createTextNode: (text: string) => ({ textContent: text }),
  };
  const container = makeElement('section');
  return { windowObj, documentObj, container };
}

function runPage(opts: {
  opportunities: Array<{ opportunityId: string; role?: string; surface?: string; note?: string }>;
  fetchImpl: (url: string, init?: unknown) => Promise<{ json: () => Promise<unknown> }>;
  storage?: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };
  reviewerId?: string;
}) {
  const { windowObj, documentObj, container } = makeDom();
  const storage = opts.storage ?? { getItem: () => null, setItem: () => undefined };
  const fn = new Function('window', 'document', REVIEWER_PAGE_SCRIPT);
  fn(windowObj, documentObj);
  const render = windowObj.renderReviewerPage as (container: unknown, deps: unknown) => void;
  render(container, {
    opportunities: opts.opportunities,
    fetchImpl: opts.fetchImpl,
    storage,
    reviewerId: opts.reviewerId,
  });
  return { windowObj, documentObj, container };
}

function candidatePayload(opportunityId: string) {
  return {
    opportunityId,
    context: { role: 'whoosh', surface: 'transition', note: 'test' },
    candidates: [
      { assetId: 'sfx_a', title: 'Alpha', durationMs: 300, audioUrl: 'https://cdn/a.mp3', role: 'whoosh', matchesRole: true, isSilence: false, rights: { licenseId: 'cc0' } },
      { assetId: 'sfx_b', title: 'Beta', durationMs: 500, audioUrl: 'https://cdn/b.mp3', role: 'tick', matchesRole: false, isSilence: false, rights: { licenseId: 'cc0' } },
      { assetId: '__silence__', title: 'silence', durationMs: 0, audioUrl: '', role: 'whoosh', matchesRole: true, isSilence: true, rights: { licenseId: 'silence' } },
    ],
  };
}

function findOpp(container: ReturnType<typeof makeDom>['container'], index: number) {
  return (container.children as Array<Record<string, unknown>>)[index] as Record<string, unknown> & { children: unknown[] };
}

function findCheckbox(opp: Record<string, unknown> & { children: unknown[] }, assetId: string, kind: string) {
  const cands = (opp.children as unknown[]).filter((c) => (c as Record<string, unknown>).className === 'cand');
  for (const cand of cands) {
    const lbl = (cand as Record<string, unknown> & { children: unknown[] }).children.find((c) => (c as Record<string, unknown>).className === 'lbl');
    const labels = (lbl as Record<string, unknown> & { children: unknown[] }).children as Array<Record<string, unknown> & { children: unknown[] }>;
    for (const lab of labels) {
      const cb = lab.children[0] as Record<string, unknown> & { dataset: Record<string, string>; fire: (t: string) => void };
      if (cb.dataset.asset === assetId && cb.dataset.kind === kind) return cb;
    }
  }
  return null;
}

function findButton(opp: Record<string, unknown> & { children: unknown[] }) {
  const fields = (opp.children as unknown[]).find((c) => (c as Record<string, unknown>).className === 'lbl') as Record<string, unknown> & { children: unknown[] };
  return fields.children.find((c) => (c as Record<string, unknown>).tagName === 'BUTTON') as Record<string, unknown> & { fire: (t: string) => void };
}

function findSilenceCheckbox(opp: Record<string, unknown> & { children: unknown[] }, which: 'ok' | 'req') {
  const fields = (opp.children as unknown[]).find((c) => (c as Record<string, unknown>).className === 'lbl') as Record<string, unknown> & { children: unknown[] };
  const labels = fields.children.filter((c) => (c as Record<string, unknown>).tagName === 'LABEL') as Array<Record<string, unknown> & { children: unknown[] }>;
  const target = labels[which === 'ok' ? 0 : 1];
  return target.children[0] as Record<string, unknown> & { fire: (t: string) => void };
}

function findAuditionGate(opp: Record<string, unknown> & { children: unknown[] }) {
  const fields = (opp.children as unknown[]).find((c) => (c as Record<string, unknown>).className === 'lbl') as Record<string, unknown> & { children: unknown[] };
  const labels = fields.children.filter((c) => (c as Record<string, unknown>).tagName === 'LABEL') as Array<Record<string, unknown> & { children: unknown[] }>;
  const gate = labels[2];
  return gate.children[0] as Record<string, unknown> & { fire: (t: string) => void };
}

function findSelects(opp: Record<string, unknown> & { children: unknown[] }) {
  const fields = (opp.children as unknown[]).find((c) => (c as Record<string, unknown>).className === 'lbl') as Record<string, unknown> & { children: unknown[] };
  const out: Array<Record<string, unknown> & { children: Array<Record<string, unknown> & { value: string }> }> = [];
  for (const child of fields.children) {
    const item = child as Record<string, unknown> & { children?: unknown[] };
    if (item.tagName === 'SELECT') out.push(item as never);
    if (item.children) {
      for (const sub of item.children) {
        if ((sub as Record<string, unknown>).tagName === 'SELECT') out.push(sub as never);
      }
    }
  }
  return out;
}

const OPS = [
  { opportunityId: 's2-001-transition-whoosh', role: 'whoosh', surface: 'transition', note: 'wipe-left' },
  { opportunityId: 's2-015-impact', role: 'impact', surface: 'transition', note: 'impact' },
];

describe('S2-L1-R reviewer UI (browser-level, exact shipped script)', () => {
  afterEach(() => {
    // no persistent state in tests
  });

  it('renders an inline reviewer identity gate and loads only after a valid identity is confirmed', async () => {
    const stored = new Map<string, string>();
    let candidateRequests = 0;
    const { container } = runPage({
      opportunities: OPS,
      fetchImpl: async () => {
        candidateRequests += 1;
        return { json: async () => candidatePayload('x') };
      },
      storage: {
        getItem: (key) => stored.get(key) ?? null,
        setItem: (key, value) => stored.set(key, value),
      },
    });

    const setup = (container.children as Array<Record<string, unknown> & { children: unknown[] }>)[0];
    expect(setup.className).toBe('reviewer-setup');
    expect(candidateRequests).toBe(0);

    const label = setup.children[0] as Record<string, unknown> & { children: unknown[] };
    const input = label.children[1] as Record<string, unknown>;
    const startButton = setup.children[1] as Record<string, unknown> & { fire: (type: string) => void };
    const status = setup.children[2] as Record<string, unknown>;

    input.value = 'invalid reviewer id';
    startButton.fire('click');
    expect(candidateRequests).toBe(0);
    expect(String(status.textContent)).toContain('Reviewer ID must be');

    input.value = 'human-listener-a';
    startButton.fire('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stored.get('sfx-reviewer')).toBe('human-listener-a');
    expect(candidateRequests).toBe(2);
    expect((container.children as unknown[]).length).toBe(3);
  });

  it('page loads without runtime error and renders all opportunities', async () => {
    const posts: unknown[] = [];
    const { container } = runPage({
      opportunities: OPS,
      fetchImpl: async (url) => {
        if (String(url).includes('/candidates')) {
          const id = new URL(String(url), 'http://x').searchParams.get('opportunityId') ?? '';
          return { json: async () => candidatePayload(id) };
        }
        posts.push(url);
        return { json: async () => ({ saved: true, reviewed: ['reviewer-test'] }) };
      },
      reviewerId: 'reviewer-test',
    });
    // Candidates load asynchronously; flush microtasks.
    await new Promise((r) => setTimeout(r, 0));
    expect((container.children as unknown[]).length).toBe(2);
  });

  it('two opportunities on the same page maintain independent controls', async () => {
    const { container } = runPage({
      opportunities: OPS,
      fetchImpl: async (url) => ({ json: async () => candidatePayload('x') }),
      reviewerId: 'reviewer-test',
    });
    await new Promise((r) => setTimeout(r, 0));

    const oppA = findOpp(container, 0);
    const oppB = findOpp(container, 1);
    const cbA = findCheckbox(oppA, 'sfx_a', 'acc');
    const cbB = findCheckbox(oppB, 'sfx_a', 'acc');
    expect(cbA).not.toBeNull();
    expect(cbB).not.toBeNull();
    expect(cbA).not.toBe(cbB); // distinct DOM nodes

    cbA!.checked = true;
    cbA!.fire('change');
    expect(cbB!.checked).toBe(false); // B unaffected
  });

  it('saving opportunity A cannot read/write opportunity B controls', async () => {
    const posts: Array<{ url: string; body: unknown }> = [];
    const { container } = runPage({
      opportunities: OPS,
      fetchImpl: async (url, init) => {
        if (String(url).includes('/candidates')) return { json: async () => candidatePayload('x') };
        posts.push({ url: String(url), body: JSON.parse(String((init as { body: string }).body)) });
        return { json: async () => ({ saved: true, reviewed: ['reviewer-test'] }) };
      },
      reviewerId: 'reviewer-test',
    });
    await new Promise((r) => setTimeout(r, 0));

    const oppA = findOpp(container, 0);
    const oppB = findOpp(container, 1);
    findCheckbox(oppA, 'sfx_a', 'acc')!.checked = true;
    findCheckbox(oppA, 'sfx_a', 'acc')!.fire('change');
    findCheckbox(oppB, 'sfx_b', 'absurd')!.checked = true;
    findCheckbox(oppB, 'sfx_b', 'absurd')!.fire('change');
    findAuditionGate(oppA)!.checked = true;
    findAuditionGate(oppA)!.fire('change');

    findButton(oppA)!.fire('click');
    await new Promise((r) => setTimeout(r, 0));
    expect(posts).toHaveLength(1);
    const body = posts[0].body as { opportunityId: string; acceptableAssetIds: string[]; absurdAssetIds: string[] };
    expect(body.opportunityId).toBe('s2-001-transition-whoosh');
    expect(body.acceptableAssetIds).toEqual(['sfx_a']);
    expect(body.absurdAssetIds).toEqual([]); // B's absurd choice NOT leaked into A
  });

  it('saving reviewer A does not overwrite reviewer B (per-reviewer POST)', async () => {
    const posts: Array<{ reviewerId: string; opportunityId: string }> = [];
    const { container } = runPage({
      opportunities: OPS,
      fetchImpl: async (url, init) => {
        if (String(url).includes('/candidates')) return { json: async () => candidatePayload('x') };
        const body = JSON.parse(String((init as { body: string }).body)) as { reviewerId: string; opportunityId: string };
        posts.push(body);
        return { json: async () => ({ saved: true, reviewed: [body.reviewerId] }) };
      },
      reviewerId: 'reviewer-a',
    });
    await new Promise((r) => setTimeout(r, 0));
    const oppA = findOpp(container, 0);
    findAuditionGate(oppA)!.checked = true;
    findAuditionGate(oppA)!.fire('change');
    findButton(oppA)!.fire('click');
    await new Promise((r) => setTimeout(r, 0));
    expect(posts[0].reviewerId).toBe('reviewer-a');
    expect(posts[0].opportunityId).toBe('s2-001-transition-whoosh');
    // Observations stay pure contract: no provenance fields in the payload.
    expect('source' in posts[0]).toBe(false);
    expect('listeningVerified' in posts[0]).toBe(false);
  });

  it('refuses to save until the reviewer affirms audible audition (gate)', async () => {
    const posts: unknown[] = [];
    const { container } = runPage({
      opportunities: OPS,
      fetchImpl: async (url, init) => {
        if (String(url).includes('/candidates')) return { json: async () => candidatePayload('x') };
        posts.push(init);
        return { json: async () => ({ saved: true, reviewed: ['reviewer-test'] }) };
      },
      reviewerId: 'reviewer-test',
    });
    await new Promise((r) => setTimeout(r, 0));
    const oppA = findOpp(container, 0);
    findButton(oppA)!.fire('click'); // gate unchecked
    await new Promise((r) => setTimeout(r, 0));
    expect(posts).toHaveLength(0); // no POST fired
  });

  it('emits field-specific state options from the shipped script', async () => {
    const { container } = runPage({
      opportunities: OPS,
      fetchImpl: async () => ({ json: async () => candidatePayload('x') }),
      reviewerId: 'reviewer-test',
    });
    await new Promise((r) => setTimeout(r, 0));
    const selects = findSelects(findOpp(container, 0));
    expect(selects).toHaveLength(5);
    const optionsOf = (sel: Record<string, unknown> & { children: Array<Record<string, unknown> & { value: string }> }) =>
      (sel.children as unknown[]).map((o) => (o as { value: string }).value);
    // role and surface: no 'not-meaningful'.
    expect(optionsOf(selects[0])).toEqual(['reviewed', 'unknown', 'not-perceptible']);
    expect(optionsOf(selects[1])).toEqual(['reviewed', 'unknown', 'not-perceptible']);
    // direction / motion speed / material: include 'not-meaningful'.
    expect(optionsOf(selects[2])).toEqual(['reviewed', 'unknown', 'not-perceptible', 'not-meaningful']);
    expect(optionsOf(selects[3])).toEqual(['reviewed', 'unknown', 'not-perceptible', 'not-meaningful']);
    expect(optionsOf(selects[4])).toEqual(['reviewed', 'unknown', 'not-perceptible', 'not-meaningful']);
  });

  it('candidate audition controls are correctly scoped per candidate', async () => {
    const { container } = runPage({
      opportunities: OPS,
      fetchImpl: async () => ({ json: async () => candidatePayload('x') }),
      reviewerId: 'reviewer-test',
    });
    await new Promise((r) => setTimeout(r, 0));
    const oppA = findOpp(container, 0);
    const cands = (oppA.children as unknown[]).filter((c) => (c as Record<string, unknown>).className === 'cand');
    const audios = cands.map((c) => (c as Record<string, unknown> & { children: unknown[] }).children.find((x) => (x as Record<string, unknown>).tagName === 'AUDIO'));
    expect(audios.filter(Boolean)).toHaveLength(2); // sfx_a + sfx_b; silence has no audio
    expect((audios[0] as Record<string, unknown>).src).toBe('https://cdn/a.mp3');
    expect((audios[1] as Record<string, unknown>).src).toBe('https://cdn/b.mp3');
  });

  it('silence selection remains correctly scoped per opportunity', async () => {
    const { container } = runPage({
      opportunities: OPS,
      fetchImpl: async () => ({ json: async () => candidatePayload('x') }),
      reviewerId: 'reviewer-test',
    });
    await new Promise((r) => setTimeout(r, 0));
    const oppA = findOpp(container, 0);
    const oppB = findOpp(container, 1);
    const silA = findSilenceCheckbox(oppA, 'req');
    const silB = findSilenceCheckbox(oppB, 'req');
    silA!.checked = true;
    silA!.fire('change');
    expect(silB!.checked).toBe(false);
  });

  it('all 11 pilot opportunities are independently savable', async () => {
    const pilotIds = [
      's2-001-transition-whoosh', 's2-015-impact', 's2-025-mg-landing', 's2-036-ui-tick',
      's2-043-ambience-foley', 's2-051-speed-diff', 's2-056-silence', 's2-057-absurd',
      's2-059-dialogue', 's2-054-weak-evidence', 's2-061-density',
    ];
    const posts: Array<{ opportunityId: string }> = [];
    const { container } = runPage({
      opportunities: pilotIds.map((id) => ({ opportunityId: id, role: 'whoosh', surface: 'transition' })),
      fetchImpl: async (url, init) => {
        if (String(url).includes('/candidates')) return { json: async () => candidatePayload('x') };
        posts.push(JSON.parse(String((init as { body: string }).body)) as { opportunityId: string });
        return { json: async () => ({ saved: true, reviewed: ['reviewer-test'] }) };
      },
      reviewerId: 'reviewer-test',
    });
    await new Promise((r) => setTimeout(r, 0));
    expect((container.children as unknown[]).length).toBe(11);
    for (let i = 0; i < 11; i++) {
      findAuditionGate(findOpp(container, i))!.checked = true;
      findAuditionGate(findOpp(container, i))!.fire('change');
      findButton(findOpp(container, i))!.fire('click');
    }
    await new Promise((r) => setTimeout(r, 0));
    expect(posts).toHaveLength(11);
    expect(posts.map((p) => p.opportunityId).sort()).toEqual([...pilotIds].sort());
  });
});
