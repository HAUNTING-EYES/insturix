/**
 * S2-L1-R — reviewer page client script (single source of truth).
 *
 * The dev route embeds this exact JS string in its HTML page; the browser
 * test executes the SAME string against a minimal DOM shim. One source, no
 * duplication, no bundler.
 *
 * REPAIR NOTES (codex review):
 *   - candidate kind bug: checkboxes are built with an explicit `kind`
 *     parameter (no undefined `k` reference).
 *   - duplicated DOM ids: NO global ids at all — every control is captured in
 *     a per-opportunity closure and read through that closure, so opportunity
 *     A can never read/write opportunity B controls.
 *   - window.save overwrite: no global handler — each opportunity's Save
 *     button gets its own onclick closure bound to its own elements.
 *
 * Contract (unchanged from the frozen corpus schema):
 *   deps.opportunities: [{opportunityId, role?, surface?, note?}]
 *   deps.fetchImpl(url, init?) -> { json(): Promise<unknown> }
 *   deps.storage: { getItem, setItem }
 *   deps.reviewerId (optional test/operator injection; otherwise entered inline)
 *
 * The script is plain JS (no TS) so it can be embedded verbatim.
 */

export const REVIEWER_PAGE_SCRIPT = `
(function () {
  'use strict';
  function renderReviewerPage(container, deps) {
    var opportunities = deps.opportunities || [];
    var fetchImpl = deps.fetchImpl || window.fetch.bind(window);
    var storage = deps.storage || window.localStorage;

    if (isValidReviewerId(deps.reviewerId)) {
      storage.setItem('sfx-reviewer', deps.reviewerId);
      renderOpportunities(container, opportunities, deps.reviewerId, fetchImpl);
      return;
    }

    var storedReviewerId = storage.getItem('sfx-reviewer') || '';
    renderReviewerIdentityGate(container, storedReviewerId, function (reviewerId) {
      storage.setItem('sfx-reviewer', reviewerId);
      renderOpportunities(container, opportunities, reviewerId, fetchImpl);
    });
  }

  function isValidReviewerId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_.@-]{1,80}$/.test(value);
  }

  function renderReviewerIdentityGate(container, storedReviewerId, onAccepted) {
    var setup = document.createElement('div');
    setup.className = 'reviewer-setup';

    var label = document.createElement('label');
    label.appendChild(document.createTextNode('Reviewer ID '));

    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'human-listener-a';
    input.value = isValidReviewerId(storedReviewerId) ? storedReviewerId : '';
    label.appendChild(input);
    setup.appendChild(label);

    var startBtn = document.createElement('button');
    startBtn.textContent = 'Start reviewing';
    setup.appendChild(startBtn);

    var status = document.createElement('div');
    status.className = 'status';
    status.textContent = 'Confirm one reviewer identity before loading opportunities.';
    setup.appendChild(status);
    container.appendChild(setup);

    var started = false;
    startBtn.addEventListener('click', function () {
      if (started) return;
      var reviewerId = String(input.value || '').trim();
      if (!isValidReviewerId(reviewerId)) {
        status.textContent = 'Reviewer ID must be 1-80 letters, numbers, dots, @, underscores, or hyphens.';
        return;
      }
      started = true;
      input.disabled = true;
      startBtn.disabled = true;
      status.textContent = 'Reviewing as ' + reviewerId + '. Reload to change reviewer identity.';
      onAccepted(reviewerId);
    });
  }

  function renderOpportunities(container, opportunities, reviewerId, fetchImpl) {

    opportunities.forEach(function (op) {
      var box = document.createElement('div');
      box.className = 'opp';
      container.appendChild(box);

      var head = document.createElement('div');
      head.className = 'meta';
      head.textContent = op.opportunityId + ' · role ' + (op.role || '?') + ' · surface ' + (op.surface || '?') + (op.note ? ' · ' + op.note : '');
      box.appendChild(head);

      var hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = 'loading candidates…';
      box.appendChild(hint);

      fetchImpl('/api/dev/sfx-labelling/candidates?opportunityId=' + encodeURIComponent(op.opportunityId))
        .then(function (r) { return r.json(); })
        .then(function (data) { renderOpportunity(box, op, data, reviewerId, fetchImpl); })
        .catch(function () { hint.textContent = 'failed to load candidates'; });
    });
  }

  function renderOpportunity(box, op, data, reviewerId, fetchImpl) {
    box.textContent = '';
    var head = document.createElement('div');
    head.className = 'meta';
    head.textContent = op.opportunityId + ' · role ' + (data.context.role || '?') + ' · surface ' + (data.context.surface || '?') + (data.context.note ? ' · ' + data.context.note : '');
    box.appendChild(head);

    // Per-opportunity state, captured in this closure — never shared.
    var vals = {};
    var silOk = false;
    var silReq = false;
    var roleState = 'reviewed';
    var surfaceState = 'reviewed';
    var directionState = 'reviewed';
    var motionSpeedState = 'reviewed';
    var materialState = 'reviewed';
    var note = '';
    var statusEl = null;

    // Candidate rows: audition + three scoped checkboxes per candidate.
    (data.candidates || []).forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'cand';

      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = (c.isSilence ? 'SILENCE' : c.title) + (c.matchesRole ? '' : '  [decoy/' + c.role + ']');
      row.appendChild(name);

      if (!c.isSilence) {
        var audio = document.createElement('audio');
        audio.controls = true;
        audio.preload = 'none';
        audio.src = c.audioUrl;
        row.appendChild(audio);
      }

      var lbl = document.createElement('div');
      lbl.className = 'lbl';
      ['acc', 'unacc', 'absurd'].forEach(function (kind) {
        var lab = document.createElement('label');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.kind = kind;
        cb.dataset.asset = c.assetId;
        cb.addEventListener('change', function () {
          vals[c.assetId] = vals[c.assetId] || { acc: false, unacc: false, absurd: false };
          vals[c.assetId][kind] = cb.checked;
        });
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(kind === 'acc' ? 'ok' : kind === 'unacc' ? '✗' : '!!'));
        lbl.appendChild(lab);
      });
      row.appendChild(lbl);
      box.appendChild(row);
    });

    // Silence + state selects + note + save, all closure-scoped.
    var fields = document.createElement('div');
    fields.className = 'lbl';

    var silOkCb = document.createElement('input');
    silOkCb.type = 'checkbox';
    silOkCb.addEventListener('change', function () { silOk = silOkCb.checked; });
    var silOkLab = document.createElement('label');
    silOkLab.appendChild(silOkCb);
    silOkLab.appendChild(document.createTextNode(' silence acceptable'));
    fields.appendChild(silOkLab);

    var silReqCb = document.createElement('input');
    silReqCb.type = 'checkbox';
    silReqCb.addEventListener('change', function () { silReq = silReqCb.checked; });
    var silReqLab = document.createElement('label');
    silReqLab.appendChild(silReqCb);
    silReqLab.appendChild(document.createTextNode(' silence required (no sound)'));
    fields.appendChild(silReqLab);

    fields.appendChild(makeSelect('role', ['reviewed', 'unknown', 'not-perceptible'], function (v) { roleState = v; }));
    fields.appendChild(makeSelect('surface', ['reviewed', 'unknown', 'not-perceptible'], function (v) { surfaceState = v; }));
    fields.appendChild(makeSelect('direction', ['reviewed', 'unknown', 'not-perceptible', 'not-meaningful'], function (v) { directionState = v; }));
    fields.appendChild(makeSelect('motion speed', ['reviewed', 'unknown', 'not-perceptible', 'not-meaningful'], function (v) { motionSpeedState = v; }));
    fields.appendChild(makeSelect('material', ['reviewed', 'unknown', 'not-perceptible', 'not-meaningful'], function (v) { materialState = v; }));

    var noteEl = document.createElement('textarea');
    noteEl.rows = 2;
    noteEl.placeholder = 'contextual note';
    noteEl.addEventListener('input', function () { note = noteEl.value; });
    fields.appendChild(noteEl);

    // Listening gate: save is refused until the reviewer affirms they audited
    // the candidates AND the silence control. This is the honest audible
    // audition gate for a human-listening observation.
    var heardOk = false;
    var heardCb = document.createElement('input');
    heardCb.type = 'checkbox';
    heardCb.addEventListener('change', function () { heardOk = heardCb.checked; });
    var heardLab = document.createElement('label');
    heardLab.appendChild(heardCb);
    heardLab.appendChild(document.createTextNode(' I auditioned the candidates and the silence control'));
    fields.appendChild(heardLab);

    var saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save my review';
    saveBtn.addEventListener('click', function () {
      if (!heardOk) {
        if (statusEl) statusEl.textContent = 'AUDITION REQUIRED: listen to candidates and silence before saving';
        return;
      }
      var acc = [], unacc = [], absurd = [];
      Object.keys(vals).forEach(function (asset) {
        if (vals[asset].acc) acc.push(asset);
        if (vals[asset].unacc) unacc.push(asset);
        if (vals[asset].absurd) absurd.push(asset);
      });
      var obs = {
        version: 'editron-sfx-observation-v1',
        opportunityId: op.opportunityId,
        reviewerId: reviewerId,
        reviewedAt: new Date().toISOString(),
        acceptableAssetIds: acc,
        unacceptableAssetIds: unacc,
        absurdAssetIds: absurd,
        silenceAcceptable: silOk,
        silenceRequired: silReq,
        roleState: roleState,
        surfaceState: surfaceState,
        directionState: directionState,
        motionSpeedState: motionSpeedState,
        materialState: materialState,
        contextualNote: note || undefined
      };
      fetchImpl('/api/dev/sfx-labelling/observation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(obs)
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (statusEl) statusEl.textContent = 'saved · reviewers: ' + (d.reviewed || []).join(', ');
      }).catch(function () {
        if (statusEl) statusEl.textContent = 'save FAILED';
      });
    });
    fields.appendChild(saveBtn);

    statusEl = document.createElement('div');
    statusEl.className = 'status';
    fields.appendChild(statusEl);

    box.appendChild(fields);
  }

  function makeSelect(label, options, onchange) {
    var wrap = document.createElement('div');
    var lab = document.createElement('span');
    lab.textContent = label + ' ';
    wrap.appendChild(lab);
    var sel = document.createElement('select');
    options.forEach(function (opt) {
      var o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { onchange(sel.value); });
    wrap.appendChild(sel);
    return wrap;
  }

  window.renderReviewerPage = renderReviewerPage;
})();
`;
