import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateApplication, escapeHtml } from './validate.ts';

const good = { name: 'Sam Lee', phone: '(904) 555-0100', email: 'sam@example.com', drivers_license: 'yes', experience: 'Fencing', availability: 'Weekdays', heard_from: 'Facebook' };

test('a complete application passes and trims', () => {
  const r = validateApplication({ ...good, name: '  Sam Lee ' });
  assert.ok(r.ok);
  assert.equal(r.ok && r.value.name, 'Sam Lee');
  assert.equal(r.ok && r.value.drivers_license, true);
});

test('name, a real phone and the license answer are required; email is optional', () => {
  assert.equal(validateApplication({ ...good, name: '' }).ok, false);
  assert.equal(validateApplication({ ...good, phone: '555' }).ok, false);
  assert.equal(validateApplication({ ...good, drivers_license: undefined }).ok, false);
  assert.equal(validateApplication({ ...good, email: 'nope' }).ok, false);
  assert.equal(validateApplication({ ...good, email: '' }).ok, true);
});

test('long input is cut, not stored whole', () => {
  const r = validateApplication({ ...good, experience: 'x'.repeat(5000) });
  assert.equal(r.ok && r.value.experience?.length, 2000);
});

test('html in an application cannot reach the email as markup', () => {
  assert.equal(escapeHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
});
