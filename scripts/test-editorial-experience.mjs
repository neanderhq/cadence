import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect } from '@playwright/test';

const desktop = { width: 1440, height: 1000 };
const phone = { width: 375, height: 812 };
const button = (root, name) => root.getByRole('button', { name, exact: true });
const dialog = (page) => page.getByRole('dialog');
const cardButton = (page, title) => page.locator('.task-card-open').filter({ has: page.getByText(title, { exact: true }) });
const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const today = new Date();
const monthDay = (offset, day) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, day));
const isoDay = (offset, day) => monthDay(offset, day).toISOString().slice(0, 10);

async function tabTo(page, locator) {
  for (let step = 0; step < 35; step += 1) {
    if (await locator.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(locator).toBeFocused();
}

async function noHorizontalOverflow(page) {
  assert.deepEqual(page.viewportSize(), phone);
  assert.equal(await page.evaluate(() => window.innerWidth), phone.width);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
}

export async function verifyEditorialExperience(browser, owner, origin, { createdUsers = [], screenshotDirectory } = {}) {
  const headers = { origin };
  const ownedBoards = [];
  const contexts = [];
  const errors = [];
  const run = randomUUID().slice(0, 6);
  const sourceTitle = 'April Field Guide';
  const sourceDescription = 'Use the partner notes and include the review link.';
  const reviewMessage = 'Could you fact-check the opening example?';
  const phoneMessage = 'The example reads clearly on a phone.';
  let capturedPage;
  let stage = 'fixtures';

  async function request(context, method, path, expected, data) {
    const response = await context.request.fetch(origin + path, { method, headers, data });
    assert.equal(response.status(), expected, method + ' ' + path + ' returned ' + await response.text());
    return expected >= 400 || expected === 204 ? undefined : response.json();
  }

  async function newContext(options) {
    const context = await browser.newContext(options);
    contexts.push(context);
    return context;
  }

  async function newPage(context) {
    const page = await context.newPage();
    capturedPage = page;
    page.on('pageerror', (error) => errors.push(error.message));
    return page;
  }

  async function capture(page, name) {
    if (screenshotDirectory) await page.screenshot({ path: join(screenshotDirectory, name + '.png'), animations: 'disabled' });
  }

  async function signup(context, name) {
    const account = await request(context, 'POST', '/api/auth/sign-up/email', 200, {
      name, email: `${randomUUID()}@example.invalid`, password: `Test-${randomUUID()}`,
    });
    createdUsers.push(account.user.id);
    return account.user.id;
  }

  async function createBoard(name) {
    const board = await request(owner, 'POST', '/api/boards', 201, { name: name + ' ' + run });
    const boardApi = '/api/boards/' + board.id;
    ownedBoards.push(boardApi);
    const draft = await request(owner, 'POST', boardApi + '/lists', 201, { name: 'Drafts' });
    const ready = await request(owner, 'POST', boardApi + '/lists', 201, { name: 'Ready' });
    return { board, boardApi, draft, ready };
  }

  async function createCard(listId, title, fields = {}) {
    return request(owner, 'POST', `/api/lists/${listId}/cards`, 201, { title, ...fields });
  }

  async function showCard(page, trigger, title) {
    await trigger.click();
    await expect(dialog(page).getByLabel('Title', { exact: true })).toHaveValue(title);
  }

  async function closeCard(page) {
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
  }

  function pendingResponse(page, path, method) {
    return page.waitForResponse((response) => response.url() === origin + path && response.request().method() === method);
  }

  async function dateEdit(page, sourceApi, field, value, expected) {
    const saved = pendingResponse(page, sourceApi, 'PATCH');
    await field.fill(value);
    assert.equal((await saved).status(), expected);
  }

  try {
    const { board, boardApi, draft, ready } = await createBoard('Harbor Press Editorial');
    const privateFixture = await createBoard('Unshared Harbor Press');
    const privateCard = await createCard(privateFixture.draft.id, 'Private second board');
    const source = await createCard(draft.id, sourceTitle, { description: sourceDescription, dueDate: isoDay(0, 12) });
    const sourceApi = '/api/cards/' + source.id;
    const second = await createCard(ready.id, 'Book club announcement', { dueDate: isoDay(0, 12) });
    const undated = await createCard(draft.id, 'Undated working note');
    const archived = await createCard(ready.id, 'Archived embargo notes', { dueDate: isoDay(0, 12) });
    await request(owner, 'PATCH', `/api/cards/${archived.id}`, 200, { archived: true });
    const label = await request(owner, 'POST', boardApi + '/labels', 201, { name: 'Fact-check', color: '#315f51', cardId: source.id });
    const item = await request(owner, 'POST', sourceApi + '/checklist', 201, { text: 'Verify every quote' });
    await request(owner, 'PATCH', `/api/checklist-items/${item.id}`, 200, { done: true });
    await request(owner, 'POST', sourceApi + '/checklist', 201, { text: 'Prepare the source list' });
    const ownerComment = await request(owner, 'POST', sourceApi + '/comments', 201, { text: 'Keep the embargo date private.' });

    const desktopOwner = await newContext({ viewport: desktop, timezoneId: 'America/Los_Angeles', storageState: await owner.storageState() });
    const phoneOwner = await newContext({ viewport: phone, isMobile: true, hasTouch: true, timezoneId: 'Asia/Kolkata', storageState: await owner.storageState() });
    const editor = await newPage(desktopOwner);
    const mobile = await newPage(phoneOwner);
    const boardUrl = origin + '/boards/' + board.id;
    const calendarTitle = (page, offset) => page.getByRole('heading', { name: monthFormat.format(monthDay(offset, 1)), exact: true });
    const calendar = (page) => page.locator('.editorial-calendar');
    const scheduled = (page, title) => calendar(page).getByRole('button', { name: new RegExp('^' + title) });
    const boardView = (page) => button(page, 'Board');

    stage = 'editorial-calendar';
    await editor.goto(boardUrl);
    await button(editor, 'Calendar').press('Enter');
    await expect(calendarTitle(editor, 0)).toBeVisible();
    await expect(editor.getByRole('list', { name: 'Month grid', exact: true })).toBeVisible();
    for (const title of [sourceTitle, second.title]) {
      const event = scheduled(editor, title);
      await expect(event).toHaveCount(1);
      await expect(event.locator('..')).toHaveAttribute('data-date', isoDay(0, 12));
    }
    await expect(scheduled(editor, undated.title)).toHaveCount(0);
    await expect(scheduled(editor, archived.title)).toHaveCount(0);
    await capture(editor, 'editorial-calendar-desktop');

    await button(editor, 'Previous month').press('Enter');
    await expect(calendarTitle(editor, -1)).toBeVisible();
    await expect(calendar(editor).getByRole('status')).toHaveText('No cards are due this month.');
    await capture(editor, 'editorial-calendar-empty-desktop');
    await tabTo(editor, button(editor, 'Today'));
    await editor.keyboard.press('Enter');
    await expect(calendarTitle(editor, 0)).toBeVisible();
    await tabTo(editor, scheduled(editor, sourceTitle));
    await editor.keyboard.press('Enter');
    const due = dialog(editor).locator('input[aria-label="Due date"]');
    await expect(due).toHaveValue(isoDay(0, 12));
    await closeCard(editor);
    await expect(scheduled(editor, sourceTitle)).toBeFocused();
    await editor.keyboard.press('Enter');
    await expect(due).toHaveValue(isoDay(0, 12));
    await dateEdit(editor, sourceApi, due, '2201-01-10', 400);
    await expect(dialog(editor).getByRole('alert')).toContainText('ISO date');
    await expect(due).toHaveValue(isoDay(0, 12));
    await editor.route(origin + sourceApi, (route) => route.abort(), { times: 1 });
    await due.fill(isoDay(1, 15));
    await expect(dialog(editor).getByRole('alert')).toContainText('Check your connection');
    await expect(due).toHaveValue(isoDay(0, 12));
    await dateEdit(editor, sourceApi, due, isoDay(1, 15), 200);
    await expect(due).toHaveValue(isoDay(1, 15));
    await expect(due).toBeEnabled();
    await closeCard(editor);
    await expect(calendarTitle(editor, 0)).toBeFocused();
    await expect(scheduled(editor, sourceTitle)).toHaveCount(0);
    await editor.reload();
    await expect(cardButton(editor, sourceTitle).locator('.due-badge')).toContainText(new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(monthDay(1, 15)));
    await button(editor, 'Calendar').click();
    await button(editor, 'Next month').click();
    await expect(scheduled(editor, sourceTitle).locator('..')).toHaveAttribute('data-date', isoDay(1, 15));

    await mobile.goto(boardUrl);
    await button(mobile, 'Calendar').tap();
    await expect(scheduled(mobile, second.title).locator('..')).toHaveAttribute('data-date', isoDay(0, 12));
    await button(mobile, 'Next month').tap();
    await expect(mobile.getByRole('list', { name: 'Calendar agenda', exact: true })).toBeVisible();
    await expect(scheduled(mobile, sourceTitle).locator('..')).toHaveAttribute('data-date', isoDay(1, 15));
    await noHorizontalOverflow(mobile);
    await capture(mobile, 'editorial-calendar-phone');
    await scheduled(mobile, sourceTitle).tap();
    await expect(dialog(mobile).locator('input[aria-label="Due date"]')).toHaveValue(isoDay(1, 15));
    const cleared = pendingResponse(mobile, sourceApi, 'PATCH');
    await button(dialog(mobile), 'Clear date').tap();
    assert.equal((await cleared).status(), 200);
    await expect(button(dialog(mobile), 'Clear date')).toBeDisabled();
    await button(dialog(mobile), 'Close card details').tap();
    await expect(calendar(mobile).getByRole('status')).toHaveText('No cards are due this month.');
    await boardView(mobile).tap();
    await expect(cardButton(mobile, sourceTitle)).toBeVisible();
    assert.equal((await request(owner, 'GET', sourceApi, 200)).dueDate, null);
    await request(owner, 'PATCH', sourceApi, 200, { dueDate: isoDay(0, 12) });
    const signedOut = await newContext();
    await request(signedOut, 'GET', sourceApi, 401);
    const guest = await newPage(signedOut);
    await guest.goto(boardUrl);
    await expect(guest).toHaveURL(origin + '/login');
    console.log('editorial-calendar: passed, including 375px agenda and keyboard focus.');

    stage = 'reuse-content-brief';
    await boardView(editor).click();
    await showCard(editor, cardButton(editor, sourceTitle), sourceTitle);
    const copyTrigger = button(dialog(editor), 'Duplicate as new brief');
    await tabTo(editor, copyTrigger);
    await editor.keyboard.press('Enter');
    const briefTitle = (page) => dialog(page).getByLabel('Brief title', { exact: true });
    await expect(briefTitle(editor)).toBeFocused();
    await expect(briefTitle(editor)).toHaveValue(sourceTitle);
    await expect(dialog(editor).getByLabel('Destination list')).toHaveValue(draft.id);
    await tabTo(editor, button(dialog(editor), 'Cancel'));
    await editor.keyboard.press('Enter');
    await expect(copyTrigger).toBeFocused();
    const listApi = `/api/lists/${ready.id}/cards`;
    const activeIds = async () => (await request(owner, 'GET', listApi, 200)).filter((card) => !card.archived).map((card) => card.id);
    assert.deepEqual(await activeIds(), [second.id]);
    await editor.keyboard.press('Enter');
    await briefTitle(editor).fill('   ');
    await briefTitle(editor).press('Enter');
    await expect(dialog(editor).getByRole('alert')).toHaveText('Brief title is required.');
    await expect(briefTitle(editor)).toBeFocused();
    await capture(editor, 'brief-copy-validation-desktop');
    await editor.keyboard.press('ControlOrMeta+A');
    await editor.keyboard.type('Field guide follow-up');
    await tabTo(editor, dialog(editor).getByLabel('Destination list'));
    await editor.keyboard.press('r');
    await expect(dialog(editor).getByLabel('Destination list')).toHaveValue(ready.id);
    await tabTo(editor, button(dialog(editor), 'Create brief'));
    const copyPath = sourceApi + '/copy';
    const copyRequest = editor.waitForRequest((req) => req.url() === origin + copyPath && req.method() === 'POST');
    await editor.route(origin + copyPath, async (route) => {
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      await route.abort();
    }, { times: 1 });
    await editor.keyboard.press('Enter');
    const payload = (await copyRequest).postDataJSON();
    await expect(dialog(editor).getByRole('alert')).toContainText('Check your connection');
    await expect(briefTitle(editor)).toHaveValue('Field guide follow-up');
    await expect(dialog(editor).getByLabel('Destination list')).toHaveValue(ready.id);
    await capture(editor, 'brief-copy-retry-desktop');
    await briefTitle(editor).press('Enter');
    await expect(dialog(editor).getByLabel('Title', { exact: true })).toHaveValue('Field guide follow-up');
    const replay = await request(owner, 'POST', copyPath, 200, payload);
    const copyApi = '/api/cards/' + replay.card.id;
    assert.deepEqual(await activeIds(), [second.id, replay.card.id]);
    assert.equal(replay.card.description, sourceDescription);
    assert.equal(replay.card.dueDate, null);
    assert.equal(replay.card.commentCount, 0);
    assert.deepEqual(replay.card.labels.map((entry) => entry.id), [label.id]);
    assert.deepEqual((await request(owner, 'GET', copyApi + '/checklist', 200)).map(({ text, done, position }) => [text, done, position]), [
      ['Verify every quote', false, 0], ['Prepare the source list', false, 1],
    ]);
    await request(owner, 'POST', copyPath, 409, { ...payload, title: 'Different request' });
    await request(owner, 'POST', copyPath, 400, { ...payload, requestId: randomUUID(), title: ' '.repeat(4) });
    await request(owner, 'POST', copyPath, 404, { ...payload, requestId: randomUUID(), listId: privateFixture.ready.id });
    await request(owner, 'POST', `/api/cards/${archived.id}/copy`, 404, { ...payload, requestId: randomUUID() });
    assert.deepEqual(await activeIds(), [second.id, replay.card.id]);
    await closeCard(editor);
    await expect(cardButton(editor, replay.card.title)).toBeFocused();
    await editor.reload();
    await showCard(editor, cardButton(editor, replay.card.title), replay.card.title);
    const description = dialog(editor).getByLabel('Description', { exact: true });
    await expect(description).toHaveValue(sourceDescription);
    const update = pendingResponse(editor, copyApi, 'PATCH');
    await description.fill('Use updated notes for this issue only.');
    await description.press('Tab');
    assert.equal((await update).status(), 200);
    assert.equal((await request(owner, 'GET', sourceApi, 200)).description, sourceDescription);
    assert.equal((await request(owner, 'GET', sourceApi + '/checklist', 200))[0].done, true);
    assert.equal((await request(owner, 'GET', sourceApi + '/comments', 200))[0].id, ownerComment.id);

    await mobile.reload();
    await cardButton(mobile, sourceTitle).tap();
    await expect(dialog(mobile).getByLabel('Title', { exact: true })).toHaveValue(sourceTitle);
    await button(dialog(mobile), 'Duplicate as new brief').tap();
    await briefTitle(mobile).fill('Field guide phone brief');
    await dialog(mobile).getByLabel('Destination list').selectOption(ready.id);
    await noHorizontalOverflow(mobile);
    await dialog(mobile).getByRole('heading', { name: 'Duplicate as new brief' }).scrollIntoViewIfNeeded();
    await capture(mobile, 'brief-copy-phone');
    await button(dialog(mobile), 'Create brief').tap();
    await expect(dialog(mobile).getByLabel('Title', { exact: true })).toHaveValue('Field guide phone brief');
    await mobile.reload();
    assert.ok((await request(owner, 'GET', listApi, 200)).some((card) => card.title === 'Field guide phone brief'));
    const concurrent = { title: 'Field guide replay', listId: ready.id, requestId: randomUUID() };
    const attempts = await Promise.all([0, 1].map(() => owner.request.post(origin + copyPath, { headers, data: concurrent })));
    assert.deepEqual(attempts.map((response) => response.status()).sort(), [200, 201]);
    assert.equal((await attempts[0].json()).card.id, (await attempts[1].json()).card.id);
    console.log('reuse-content-brief: passed, including concurrent replay, response loss, keyboard and 375px.');

    stage = 'private-reviewer-access';
    const reviewer = await newContext({ viewport: desktop });
    const outsider = await newContext({ viewport: desktop });
    const reviewerId = await signup(reviewer, 'Frankie Rowan');
    const outsiderId = await signup(outsider, 'Sky Harper');
    const reviewerPage = await newPage(reviewer);
    await reviewerPage.goto(origin);
    await expect(reviewerPage.getByRole('heading', { name: 'Shared with you' })).toHaveCount(0);
    await reviewerPage.getByText('Your reviewer ID', { exact: true }).click();
    await expect(reviewerPage.getByRole('textbox', { name: 'Your reviewer ID' })).toHaveValue(reviewerId);
    const reviewerApi = boardApi + '/reviewer';
    await request(owner, 'GET', reviewerApi, 200);
    await request(reviewer, 'GET', sourceApi, 404);
    await request(outsider, 'POST', reviewerApi, 404, { reviewerId: outsiderId });
    await request(outsider, 'PATCH', sourceApi, 404, { dueDate: isoDay(0, 16) });
    await request(outsider, 'POST', copyPath, 404, { ...payload, requestId: randomUUID() });
    await editor.goto(boardUrl);
    await button(editor, 'Reviewer access').press('Enter');
    const accessPanel = (page) => page.getByRole('region', { name: 'Private reviewer access' });
    const reviewerIdInput = editor.getByRole('textbox', { name: 'Reviewer ID', exact: true });
    await expect(reviewerIdInput).toBeFocused();
    await editor.keyboard.type('missing-fixture-account');
    await tabTo(editor, button(editor, 'Grant access'));
    await editor.keyboard.press('Enter');
    await expect(accessPanel(editor).getByRole('alert')).toContainText('No account matches that reviewer ID');
    await expect(reviewerIdInput).toHaveValue('missing-fixture-account');
    await reviewerIdInput.fill(reviewerId);
    await tabTo(editor, button(editor, 'Grant access'));
    await editor.keyboard.press('Enter');
    await expect(accessPanel(editor).getByRole('status')).toHaveText('Frankie Rowan can now review this board.');
    await expect(button(editor, 'Revoke access')).toBeFocused();
    await capture(editor, 'reviewer-granted-desktop');

    await request(owner, 'POST', reviewerApi, 200, { reviewerId });
    await request(owner, 'POST', reviewerApi, 409, { reviewerId: outsiderId });
    await request(owner, 'DELETE', reviewerApi, 409, { reviewerId: outsiderId });
    assert.equal((await request(owner, 'GET', reviewerApi, 200)).id, reviewerId);
    await editor.reload();
    await button(editor, 'Reviewer access').click();
    await expect(editor.getByText('Current reviewer', { exact: true })).toBeVisible();
    await expect(editor.getByText('Frankie Rowan', { exact: true })).toBeVisible();
    await reviewerPage.reload();
    await reviewerPage.getByRole('link', { name: board.name, exact: true }).press('Enter');
    await expect(reviewerPage.getByRole('heading', { name: board.name, exact: true })).toBeVisible();
    await expect(cardButton(reviewerPage, archived.title)).toHaveCount(0);
    await expect(button(reviewerPage, 'Reviewer access')).toHaveCount(0);
    await expect(button(reviewerPage, 'Calendar')).toHaveCount(0);
    await capture(reviewerPage, 'reviewer-board-desktop');
    await cardButton(reviewerPage, sourceTitle).press('Enter');
    const review = dialog(reviewerPage);
    await expect(review.getByRole('heading', { name: sourceTitle })).toBeVisible();
    await expect(review.getByText(sourceDescription)).toBeVisible();
    await expect(review.getByText('Fact-check', { exact: true })).toBeVisible();
    await expect(review.getByText('Verify every quote', { exact: true })).toBeVisible();
    await expect(review.locator('time[datetime="' + isoDay(0, 12) + '"]')).toBeVisible();
    await expect(review.getByLabel('Title', { exact: true })).toHaveCount(0);
    await expect(button(review, 'Duplicate as new brief')).toHaveCount(0);
    await expect(button(review, 'Archive card')).toHaveCount(0);
    await expect(button(review, 'Delete')).toHaveCount(0);
    await tabTo(reviewerPage, review.getByLabel('Add a comment', { exact: true }));
    await reviewerPage.keyboard.type(reviewMessage);
    await tabTo(reviewerPage, button(review, 'Add comment'));
    const desktopComment = pendingResponse(reviewerPage, sourceApi + '/comments', 'POST');
    await reviewerPage.keyboard.press('Enter');
    assert.equal((await desktopComment).status(), 201);
    await expect(review.locator('.comment-list').getByText(reviewMessage, { exact: true })).toBeVisible();
    await expect(review.getByText('Frankie Rowan', { exact: true })).toBeVisible();
    await capture(reviewerPage, 'reviewer-comments-desktop');
    await closeCard(reviewerPage);
    await expect(cardButton(reviewerPage, sourceTitle)).toBeFocused();

    const reviewerPhone = await newContext({ viewport: phone, isMobile: true, hasTouch: true, storageState: await reviewer.storageState() });
    const phoneReview = await newPage(reviewerPhone);
    await phoneReview.goto(origin);
    await phoneReview.getByRole('link', { name: board.name, exact: true }).tap();
    await expect(phoneReview.getByRole('heading', { name: board.name, exact: true })).toBeVisible();
    await noHorizontalOverflow(phoneReview);
    await capture(phoneReview, 'reviewer-board-phone');
    await cardButton(phoneReview, sourceTitle).tap();
    const phoneDialog = dialog(phoneReview);
    await expect(phoneDialog.getByText(reviewMessage, { exact: true })).toBeVisible();
    await phoneDialog.getByLabel('Add a comment').fill(phoneMessage);
    const submittedPhoneComment = pendingResponse(phoneReview, sourceApi + '/comments', 'POST');
    await button(phoneDialog, 'Add comment').tap();
    assert.equal((await submittedPhoneComment).status(), 201);
    const publishedPhoneComment = phoneDialog.locator('.comment-list').getByText(phoneMessage, { exact: true });
    await expect(publishedPhoneComment).toBeVisible();
    await expect(phoneDialog.getByText('Frankie Rowan', { exact: true }).last()).toBeVisible();
    await noHorizontalOverflow(phoneReview);
    await publishedPhoneComment.scrollIntoViewIfNeeded();
    await capture(phoneReview, 'reviewer-comments-phone');

    const notes = await request(owner, 'GET', sourceApi + '/comments', 200);
    assert.equal(notes.find((comment) => comment.text === reviewMessage).authorId, reviewerId);
    const reviewerComment = notes.find((comment) => comment.text === phoneMessage);
    assert.ok(reviewerComment);
    assert.equal(reviewerComment.canDelete, false);
    assert.equal(notes.find((comment) => comment.id === ownerComment.id).canDelete, true);
    assert.equal((await request(reviewer, 'GET', '/api/boards', 200)).some((entry) => entry.id === board.id), false);
    for (const path of [boardApi, boardApi + '/lists', boardApi + '/labels', reviewerApi, '/api/cards/' + privateCard.id]) {
      await request(reviewer, 'GET', path, 404);
    }
    const archivedApi = '/api/cards/' + archived.id;
    for (const suffix of ['', '/labels', '/checklist', '/comments']) {
      await request(reviewer, 'GET', archivedApi + suffix, 404);
      await request(outsider, 'GET', sourceApi + suffix, 404);
    }
    for (const changes of [{ title: 'Forbidden' }, { dueDate: isoDay(0, 16) }, { archived: true }]) {
      await request(reviewer, 'PATCH', sourceApi, 404, changes);
    }
    await request(reviewer, 'POST', archivedApi + '/comments', 404, { text: 'Forbidden archived comment' });
    await request(reviewer, 'POST', sourceApi + '/move', 404, { listId: ready.id, position: 0 });
    await request(reviewer, 'POST', copyPath, 404, { ...payload, requestId: randomUUID() });
    await request(reviewer, 'POST', sourceApi + '/checklist', 404, { text: 'Forbidden checklist' });
    await request(reviewer, 'DELETE', '/api/comments/' + reviewerComment.id, 404);
    await request(reviewer, 'DELETE', reviewerApi, 404, { reviewerId });
    await request(reviewer, 'POST', sourceApi + '/comments', 400, { text: '  ' });

    await mobile.goto(boardUrl);
    await button(mobile, 'Reviewer access').tap();
    await expect(mobile.getByText('Frankie Rowan', { exact: true })).toBeVisible();
    await noHorizontalOverflow(mobile);
    await capture(mobile, 'reviewer-granted-phone');
    await button(mobile, 'Revoke access').tap();
    await expect(accessPanel(mobile).getByRole('status')).toHaveText('Reviewer access revoked.');
    await expect(mobile.getByRole('textbox', { name: 'Reviewer ID', exact: true })).toBeFocused();
    assert.equal(await request(owner, 'GET', reviewerApi, 200), null);
    await request(reviewer, 'GET', sourceApi, 404);
    await request(reviewer, 'POST', sourceApi + '/comments', 404, { text: 'Access already revoked' });
    await request(reviewer, 'GET', sourceApi + '/comments', 404);
    await reviewerPage.goto(origin);
    await expect(reviewerPage.getByRole('link', { name: board.name, exact: true })).toHaveCount(0);
    const revoked = await reviewerPage.goto(boardUrl);
    assert.equal(revoked.status(), 404);
    await expect(reviewerPage.getByRole('heading', { name: board.name, exact: true })).toHaveCount(0);
    assert.equal((await request(owner, 'GET', sourceApi + '/comments', 200)).some((comment) => comment.id === reviewerComment.id), true);
    await mobile.getByRole('textbox', { name: 'Reviewer ID', exact: true }).fill(reviewerId);
    await button(mobile, 'Grant access').tap();
    await expect(accessPanel(mobile).getByRole('status')).toHaveText('Frankie Rowan can now review this board.');
    await editor.reload();
    await button(editor, 'Reviewer access').press('Enter');
    await expect(button(editor, 'Revoke access')).toBeFocused();
    await editor.keyboard.press('Enter');
    await expect(accessPanel(editor).getByRole('status')).toHaveText('Reviewer access revoked.');
    await request(reviewer, 'GET', sourceApi, 404);
    assert.deepEqual(errors, []);
    console.log('private-reviewer-access: passed, including existing-session revocation, retention, keyboard and 375px.');
  } catch (error) {
    if (capturedPage) await capture(capturedPage, stage + '-failed').catch(() => {});
    throw new Error('Editorial acceptance failed at ' + stage, { cause: error });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    for (const path of ownedBoards) await request(owner, 'DELETE', path, 204);
  }
}
