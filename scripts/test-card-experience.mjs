import assert from "node:assert/strict";
import { expect } from "@playwright/test";

export async function verifyCardExperience(browser, context, origin, board, firstList) {
  const page = await context.newPage();
  const boardPath = origin + "/boards/" + board.id;
  const listCardsPath = origin + "/api/lists/" + firstList.id + "/cards";
  const headers = { origin };
  let createdCardId;

  try {
    await page.goto(boardPath);
    const title = page.getByLabel("New card title in " + firstList.name, { exact: true });
    const add = title.locator("..").getByRole("button", { name: /Add card/ });
    const count = (await (await context.request.get(listCardsPath)).json()).length;
    for (const [value, message] of [
      ["   ", "Card title is required."],
      ["x".repeat(201), "Card title must be 200 characters or fewer."],
    ]) {
      await title.fill(value);
      await add.click();
      await expect(title).toBeFocused();
      await expect(title).toHaveAccessibleDescription(message);
      await expect(title).toHaveAttribute("aria-invalid", "true");
      assert.equal((await (await context.request.get(listCardsPath)).json()).length, count);
    }

    const originalTitle = "Fictional keyboard acceptance card";
    await title.fill(originalTitle);
    await expect(title).not.toHaveAttribute("aria-invalid", "true");
    const created = page.waitForResponse(response => response.url() === listCardsPath && response.request().method() === "POST");
    await title.press("Enter");
    const response = await created;
    assert.equal(response.status(), 201);
    createdCardId = (await response.json()).id;
    const card = page.locator(".task-card-open").filter({ hasText: originalTitle });
    await card.press("Enter");

    const editor = page.getByRole("dialog");
    const editTitle = editor.getByRole("textbox", { name: "Title", exact: true });
    const editDescription = editor.getByRole("textbox", { name: "Description", exact: true });
    const close = editor.getByRole("button", { name: "Close card details" });
    await expect(editTitle).toBeFocused();
    await editTitle.press("Shift+Tab");
    await expect(close).toBeFocused();
    await close.press("Shift+Tab");
    await expect(editor.getByRole("button", { name: "Archive card", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();

    await editTitle.fill("  ");
    await editTitle.press("Tab");
    await expect(editTitle).toHaveAccessibleDescription("Card title is required.");
    await expect(editTitle).toHaveValue("  ");
    const cardPath = origin + "/api/cards/" + createdCardId;
    assert.equal((await (await context.request.get(cardPath)).json()).title, originalTitle);

    // Delay the first real write so focus and a second draft are exercised in flight.
    const isTitleWrite = request => request.url() === cardPath && request.method() === "PATCH" && "title" in request.postDataJSON();
    const titleRequest = page.waitForRequest(isTitleWrite);
    const releaseTitle = Promise.withResolvers();
    const hold = async route => {
      if (isTitleWrite(route.request())) {
        await releaseTitle.promise;
      }
      await route.continue();
    };
    await page.route(cardPath, hold);
    const updatedTitle = originalTitle + " edited";
    const updatedDescription = "The second edit was entered while the first request was still saving.";
    try {
      await editTitle.fill(updatedTitle);
      await editTitle.press("Tab");
      await expect(editDescription).toBeFocused();
      await titleRequest;
      await expect(editor.getByRole("status")).toHaveText("Saving…");
      await editDescription.fill(updatedDescription);
      await page.keyboard.press("Escape");
      await expect(editor).toBeVisible();
    } finally {
      releaseTitle.resolve();
    }
    await expect(editor).toHaveCount(0);
    await page.unroute(cardPath, hold);
    const updatedCard = page.locator(".task-card-open").filter({ hasText: updatedTitle });
    await expect(updatedCard).toBeFocused();
    await page.reload();
    await updatedCard.press("Enter");
    await expect(editTitle).toHaveValue(updatedTitle);
    await expect(editDescription).toHaveValue(updatedDescription);
    const stored = await (await context.request.get(cardPath)).json();
    assert.equal(stored.title, updatedTitle);
    assert.equal(stored.description, updatedDescription);
  } finally {
    await page.close();
    if (createdCardId) {
      const removed = await context.request.delete(origin + "/api/cards/" + createdCardId, { headers });
      assert.equal(removed.status(), 204);
    }
  }

  const phone = await browser.newContext({
    storageState: await context.storageState(),
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const boardPage = await phone.newPage();
    await boardPage.goto(boardPath);
    await boardPage.getByRole("button", { name: "Filters", exact: true }).click();
    await expect(boardPage.getByRole("searchbox", { name: "Search cards" })).toBeVisible();
    const layout = await boardPage.evaluate(() => ({
      width: innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      cardArea: document.querySelector(".card-stack").clientHeight,
    }));
    assert.equal(layout.width, 375);
    assert.ok(layout.pageWidth <= layout.width, "Expanded filters cause horizontal page overflow");
    assert.ok(layout.cardArea >= 80, "Expanded filters squeeze the card area below one usable row");
  } finally {
    await phone.close();
  }
  console.log("Card validation, autosave focus, queued draft persistence and 375px filter layout passed.");
}
