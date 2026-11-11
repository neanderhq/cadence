import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleData, sampleDueDate, seed } from '../.neander/seed.mjs';

test('seed rejects missing or weak configuration before contacting a database', async () => {
  await assert.rejects(seed({ password: 'test-secret-value' }), /DATABASE_URL/);
  await assert.rejects(seed({ databaseUrl: 'postgresql://invalid.invalid/test' }), /DEMO_OWNER_PASSWORD/);
  await assert.rejects(seed({ databaseUrl: 'postgresql://invalid.invalid/test', password: 'short' }), /at least 12/);
});

test('sample cards reference real lists and labels', () => {
  assert.equal(sampleData.lists.length, 5);
  assert.equal(sampleData.cards.length, 8);
  for (const card of sampleData.cards) {
    assert.ok(sampleData.lists.includes(card.list));
    for (const label of card.labels) assert.ok(sampleData.labels.some(value => value.name === label));
  }
});

test('sample due dates use UTC across month and year boundaries', () => {
  assert.equal(sampleDueDate(2, new Date('2026-12-31T23:59:00-08:00')).toISOString(), '2027-01-03T12:00:00.000Z');
  assert.equal(sampleDueDate(-1, new Date('2026-03-01T05:00:00Z')).toISOString(), '2026-02-28T12:00:00.000Z');
  assert.equal(sampleDueDate(null), null);
});
