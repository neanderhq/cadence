// Exercises the exact built image against an explicitly disposable PostgreSQL DB.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { Client } from 'pg';
import { verifyCardExperience } from './test-card-experience.mjs';
import { DEMO_OWNER_ID, DEMO_EMAIL, seed } from '../.neander/seed.mjs';

const exec = promisify(execFile);
const image = process.env.NEANDER_TEMPLATE_IMAGE;
const databaseUrl = process.env.NEANDER_TEMPLATE_TEST_DATABASE_URL;
assert.ok(image, 'The shared verifier must supply the built image');
assert.ok(databaseUrl, 'An explicitly disposable test database is required');
assert.equal(process.env.DATABASE_URL, databaseUrl);
const origin = new URL(process.env.BETTER_AUTH_URL);
assert.equal(origin.protocol, 'http:');
assert.ok(['127.0.0.1', 'localhost'].includes(origin.hostname));
const password = process.env.DEMO_OWNER_PASSWORD;
assert.ok(password && process.env.BETTER_AUTH_SECRET);
const name = `content-board-template-check-${randomUUID().slice(0, 12)}`;
const directory = await mkdtemp(join(tmpdir(), 'content-board-template-'));
const bundle = join(directory, 'neander_environment');
const runtimeDatabase = new URL(databaseUrl);
if (process.platform === 'darwin' && ['localhost', '127.0.0.1'].includes(runtimeDatabase.hostname)) runtimeDatabase.hostname = 'host.docker.internal';
const environment = { DATABASE_URL: runtimeDatabase.href, BETTER_AUTH_URL: origin.origin, BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET, DEMO_OWNER_PASSWORD: password };
await writeFile(bundle, Object.entries(environment).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o644 });
// The temporary directory is 0700. The non-root image user must read its mounted
// bundle; remove the bundle and directory in finally, never log their contents.
const db = new Client({ connectionString: databaseUrl });
let browser;
let connected = false;
let secondUserId;
async function ready() {
  for (let attempt = 0; attempt < 120; attempt++) {
    try { if ((await fetch(`${origin.origin}/api/health`)).ok) return; } catch {}
    await delay(500);
  }
  throw new Error('Built image did not become ready within 60 seconds');
}
async function json(response, status = 200) {
  assert.equal(response.status(), status, await response.text());
  return status === 204 ? undefined : response.json();
}
const headers = { origin: origin.origin };
try {
  const networking = process.platform === 'linux' ? ['--network', 'host', '--env', `PORT=${origin.port || 80}`] : ['--publish', `127.0.0.1:${origin.port || 80}:8080`];
  await exec('docker', ['run', '--detach', '--name', name, '--mount', `type=bind,src=${bundle},dst=/run/secrets/neander_environment,readonly`, ...networking, image], { timeout: 60000 });
  await ready();
  console.log('Built container is ready; checking entrypoint and public routes.');
  await exec('python3', ['scripts/test_entrypoint.py'], { timeout: 60000 });
  await exec('python3', ['scripts/smoke.py', origin.origin], { timeout: 60000 });
  await db.connect(); connected = true;
  const credentialBefore = (await db.query('SELECT password FROM account WHERE user_id=$1', [DEMO_OWNER_ID])).rows[0].password;
  assert.deepEqual(await seed({ databaseUrl, password }), { created: false });
  await exec('pnpm', ['exec', 'playwright', 'install', ...(process.platform === 'linux' ? ['--with-deps'] : []), 'chromium'], { timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
  console.log('Browser installed; checking populated board and owner login.');
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'UTC' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const anonymous = await browser.newContext();
  assert.equal((await anonymous.request.get(`${origin.origin}/api/boards`)).status(), 401);
  const anonymousPage = await anonymous.newPage();
  await anonymousPage.goto(origin.origin);
  await expect(anonymousPage).toHaveURL(/\/login$/);
  await page.goto(`${origin.origin}/login`);
  await page.getByLabel('Email', { exact: true }).fill(DEMO_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(`${origin.origin}/`);
  const boards = await json(await context.request.get(`${origin.origin}/api/boards`));
  assert.equal(boards.length, 1);
  const board = boards[0];
  assert.equal(board.name, 'Marketing Content Calendar');
  await page.goto(`${origin.origin}/boards/${board.id}`);
  await expect(page.getByRole('heading', { name: board.name, exact: true })).toBeVisible();
  await expect(page.locator('.list-column')).toHaveCount(5);
  await expect(page.locator('.task-card')).toHaveCount(8);
  await page.evaluate(() => document.fonts.ready);
  if (process.env.NEANDER_TEMPLATE_SCREENSHOT) await page.screenshot({ path: process.env.NEANDER_TEMPLATE_SCREENSHOT, fullPage: true, animations: 'disabled' });
  const lists = await json(await context.request.get(`${origin.origin}/api/boards/${board.id}/lists`));
  const ideas = lists.find(list => list.name === 'Ideas');
  const drafting = lists.find(list => list.name === 'Drafting');
  const readyList = lists.find(list => list.name === 'Ready');
  await verifyCardExperience(browser, context, origin.origin, board, ideas);
  const cards = await json(await context.request.get(`${origin.origin}/api/lists/${ideas.id}/cards`));
  const card = cards[0];
  // Real pointer drag through dnd-kit, with persisted state as the postcondition.
  const handle = page.getByRole('button', { name: `Drag ${card.title}`, exact: true });
  const source = await handle.boundingBox();
  const target = await page.locator('.list-column').filter({ has: page.getByRole('heading', { name: 'Drafting', exact: true }) }).locator('.card-stack').boundingBox();
  assert.ok(source && target);
  const moved = page.waitForResponse(response => response.url().endsWith(`/api/cards/${card.id}/move`) && response.request().method() === 'POST');
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2, { steps: 3 });
  await page.mouse.move(target.x + target.width / 2, target.y + 30, { steps: 20 });
  await page.mouse.up();
  await json(await moved);
  await expect.poll(async () => (await json(await context.request.get(`${origin.origin}/api/cards/${card.id}`))).listId).toBe(drafting.id);
  // Edit through the card dialog and wait for the real save response.
  await page.locator('.task-card-open').filter({ hasText: card.title }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue(card.title);
  const updatedTitle = `${card.title} — edited`;
  await dialog.getByLabel('Title', { exact: true }).fill(updatedTitle);
  const saved = page.waitForResponse(response => response.url().endsWith(`/api/cards/${card.id}`) && response.request().method() === 'PATCH');
  await dialog.getByLabel('Description', { exact: true }).click();
  await json(await saved);
  await dialog.locator('.move-card-form select').first().selectOption(readyList.id);
  const movedAgain = page.waitForResponse(response => response.url().endsWith(`/api/cards/${card.id}/move`) && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Move card', exact: true }).click();
  await json(await movedAgain);
  await dialog.getByRole('button', { name: 'Close card details' }).click();
  const removedCard = cards[1];
  await json(await context.request.delete(`${origin.origin}/api/cards/${removedCard.id}`, { headers }), 204);
  await Promise.all([seed({ databaseUrl, password: 'replacement-not-used' }), seed({ databaseUrl, password: 'replacement-not-used' })]);
  const persisted = await json(await context.request.get(`${origin.origin}/api/cards/${card.id}`));
  assert.equal(persisted.title, updatedTitle);
  assert.equal(persisted.listId, readyList.id);
  assert.equal((await context.request.get(`${origin.origin}/api/cards/${removedCard.id}`)).status(), 404);
  assert.equal((await db.query('SELECT password FROM account WHERE user_id=$1', [DEMO_OWNER_ID])).rows[0].password, credentialBefore);
  console.log('Pointer drag, edit, move and concurrent seed retry checks passed.');
  // Signup still creates a separate private workspace; it cannot read/mutate demo records.
  const signup = await json(await anonymous.request.post(`${origin.origin}/api/auth/sign-up/email`, { headers, data: { name: 'Robin Taylor', email: `robin-${randomUUID()}@example.invalid`, password: `Test-${randomUUID()}` } }));
  secondUserId = signup.user.id;
  const ownBoards = await json(await anonymous.request.get(`${origin.origin}/api/boards`));
  assert.equal(ownBoards.length, 1);
  assert.notEqual(ownBoards[0].id, board.id);
  assert.equal((await anonymous.request.get(`${origin.origin}/api/boards/${board.id}`)).status(), 404);
  assert.equal((await anonymous.request.patch(`${origin.origin}/api/cards/${card.id}`, { headers, data: { title: 'Unauthorized edit' } })).status(), 404);
  await json(await anonymous.request.delete(`${origin.origin}/api/boards/${ownBoards[0].id}`, { headers }), 204);
  await exec('docker', ['restart', name], { timeout: 60000 });
  await ready();
  assert.equal((await json(await context.request.get(`${origin.origin}/api/cards/${card.id}`))).title, updatedTitle, 'Edit and session survive container restart');
  assert.equal((await json(await context.request.get(`${origin.origin}/api/cards/${card.id}`))).listId, readyList.id);
  assert.equal((await json(await anonymous.request.get(`${origin.origin}/api/boards`))).length, 0, 'Deleted signup board is not recreated after restart');
  await json(await context.request.delete(`${origin.origin}/api/boards/${board.id}`, { headers }), 204);
  await seed({ databaseUrl, password });
  assert.equal((await json(await context.request.get(`${origin.origin}/api/boards`))).length, 0, 'Template retry must not recreate a deleted sample board');
  await exec(process.execPath, ['.neander/check-auth.mjs', origin.origin], { timeout: 60000 });
  assert.deepEqual(errors, [], 'Seeded UI must have no browser runtime errors');
  console.log('Built-image verification passed: seeded browser login/board, pointer drag, edit and move, signup isolation, concurrent seed retries, preserved password/deletions, restart persistence, and auth checks.');
} catch (error) {
  const logs = await exec('docker', ['logs', '--tail', '80', name]).catch(() => ({ stdout: '', stderr: '' }));
  console.error(logs.stdout, logs.stderr);
  throw error;
} finally {
  if (connected) {
    // Remove only this verifier\'s fixture users; leave the disposable DB reseedable.
    await db.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[DEMO_OWNER_ID, secondUserId].filter(Boolean)]);
    await db.end();
  }
  if (browser) await browser.close();
  await exec('docker', ['rm', '--force', name]).catch(() => {});
  await rm(directory, { recursive: true, force: true });
}
