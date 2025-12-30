import test from 'node:test';
import assert from 'node:assert/strict';

import { listTemplates, renderTemplate } from '../templates';

test('renderTemplate returns HTML and text variants', () => {
  const result = renderTemplate('notification', {
    name: 'Sam',
    title: 'Update available',
    message: 'A new feature is ready to try.',
  });

  assert.equal(result.subject, 'Update available');
  assert.ok(result.html.includes('Sam'));
  assert.ok(result.text?.includes('Sam'));
});

test('listTemplates exposes expected template ids', () => {
  const ids = listTemplates();
  assert.ok(ids.includes('welcome'));
  assert.ok(ids.includes('security-alert'));
});
