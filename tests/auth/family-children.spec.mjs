import { expect, test } from "@playwright/test";
import {
  account,
  addChild,
  childAddDialog,
  childAddForm,
  chooseSeat,
  closeAction,
  expectToast,
  family,
  openAction,
  submitSignIn,
} from "./helpers.mjs";
import { authenticatedRpc, sessionToken } from "./rpc.mjs";

const saveChildRpc = "**/rest/v1/rpc/save_own_child";

async function storedChildren(page, familyId) {
  const url = new URL("/rest/v1/children", process.env.EXPO_PUBLIC_SUPABASE_URL);
  url.searchParams.set("family_id", `eq.${familyId}`);
  url.searchParams.set("select", "id,display_name,seat_requirement,revision");
  url.searchParams.set("order", "display_name");
  const response = await page.request.get(url.href, {
    headers: {
      apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${await sessionToken(page.context())}`,
    },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

const childRow = (page, name) =>
  page.getByRole("group", { name, exact: true });
const seat = (scope, label) =>
  scope
    .getByRole("radiogroup", { name: "Seat", exact: true })
    .getByRole("radio", { name: label, exact: true });
const seatNames = {
  standard: "Standard",
  booster: "Booster",
  "child-seat": "Child seat",
};
// Every sheet for a child starts from a blank name and a standard seat.
async function expectBlankAddForm(page) {
  await openAction(page, "Add a child");
  const form = childAddForm(page);
  await expect(form.getByLabel("Name", { exact: true })).toHaveValue("");
  await expect(seat(form, "Standard")).toBeChecked();
  await closeAction(page, "Add a child");
}

test("My family adds two children consecutively and edits each child in place", async ({
  browser,
}) => {
  const { context, page } = await account(browser, "child-roster");
  try {
    const dashboard = await family(page, "Child roster family", "Guardian");
    const familyId = new URL(dashboard).pathname.split("/").at(-1);
    await expect(
      page.getByRole("button", { name: "Add a child", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Add a child to plan a ride.")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Children", exact: true }),
    ).toHaveCount(0);
    const rosterRead = (url) =>
      url.pathname.endsWith("/rest/v1/children") &&
      url.searchParams.get("select") === "id,display_name,seat_requirement,revision";
    const refresh = Promise.withResolvers();
    await page.route(rosterRead, async (route) => {
      await refresh.promise;
      await route.continue();
    }, { times: 1 });
    try {
      const requested = page.waitForRequest((request) =>
        rosterRead(new URL(request.url())),
      );
      // The saved child shows before the roster has been read again.
      await addChild(page, "Zoe", "child-seat");
      await requested;
      await expect(childRow(page, "Zoe").getByText("Child seat")).toBeVisible();
      await expect(page.getByText("Add a child to plan a ride.")).toHaveCount(0);
      await expectBlankAddForm(page);
    } finally {
      refresh.resolve();
    }

    await addChild(page, "Ari", "booster");
    await expectBlankAddForm(page);
    await expect(page.getByRole("heading", { name: /^(Ari|Zoe)$/ })).toHaveText([
      "Ari",
      "Zoe",
    ]);
    await expect(childRow(page, "Ari").getByText("Booster seat")).toBeVisible();
    const [ari, zoe] = await storedChildren(page, familyId);
    expect(ari.id).not.toBe(zoe.id);

    for (const [child, name, seatValue, seatLabel] of [
      [ari, "Ari updated", "standard", "Standard seat"],
      [zoe, "Zoe updated", "booster", "Booster seat"],
    ]) {
      const dialog = await openAction(
        page,
        `Edit ${child.display_name}`,
        childRow(page, child.display_name).getByRole("button", {
          name: "Edit",
          exact: true,
        }),
      );
      const displayName = dialog.getByLabel("Name", { exact: true });
      await expect(displayName).toHaveValue(child.display_name);
      await expect(
        seat(dialog, seatNames[child.seat_requirement]),
      ).toBeChecked();
      await displayName.fill(name);
      await chooseSeat(dialog, seatValue);
      await dialog
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      // A saved edit closes its sheet and confirms by name.
      await expectToast(page, `${name} updated`);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(childRow(page, name).getByText(seatLabel)).toBeVisible();
    }
    expect(await storedChildren(page, familyId)).toEqual([
      { ...ari, display_name: "Ari updated", seat_requirement: "standard", revision: 2 },
      { ...zoe, display_name: "Zoe updated", seat_requirement: "booster", revision: 2 },
    ]);
    await expect(page).toHaveURL(dashboard);

    await openAction(
      page,
      "Edit Ari updated",
      childRow(page, "Ari updated").getByRole("button", {
        name: "Edit",
        exact: true,
      }),
    );
    // The sheet takes the child's latest name once the roster is read again.
    const dialog = page.getByRole("dialog", { name: /^Edit / });
    const displayName = dialog.getByLabel("Name", { exact: true });
    await displayName.fill("Guardian draft");
    const concurrentEdit = await authenticatedRpc(page, "save_own_child", {
      p_id: ari.id,
      p_family_id: familyId,
      p_display_name: "Ari changed elsewhere",
      p_seat_requirement: "standard",
      p_revision: 2,
    });
    expect(concurrentEdit.ok()).toBe(true);
    await dialog
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Someone else just changed this child. Close this and open it again to see the latest.",
    );
    // A refused save keeps the sheet open with the draft, and shows no toast.
    await expect(displayName).toHaveValue("Guardian draft");
    await expect(page.getByTestId("toast")).toHaveCount(0);
    await dialog.getByRole("button", { name: /^Close Edit / }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Ari changed elsewhere", exact: true }),
    ).toBeVisible();
    expect(
      (await storedChildren(page, familyId)).map((child) => child.display_name),
    ).toEqual(["Ari changed elsewhere", "Zoe updated"]);
  } finally {
    await context.close();
  }
});

test("retrying a committed child save after losing its response creates only one child", async ({
  browser,
}) => {
  const { context, page } = await account(browser, "child-retry");
  try {
    const dashboard = await family(page, "Child retry family", "Guardian");
    const familyId = new URL(dashboard).pathname.split("/").at(-1);
    await openAction(page, "Add a child");
    const form = childAddForm(page);
    await form.getByLabel("Name", { exact: true }).fill("Retry child");
    await chooseSeat(form, "booster");
    const committed = Promise.withResolvers();
    await page.route(saveChildRpc, async (route) => {
      try {
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        committed.resolve(await response.json());
      } catch (error) {
        committed.reject(error);
      } finally {
        await route.abort("failed");
      }
    }, { times: 1 });
    const save = form.getByRole("button", { name: "Add child", exact: true });
    const firstRequest = page.waitForRequest(saveChildRpc);
    await save.click();
    const original = (await firstRequest).postDataJSON();
    expect(await committed.promise).toBe(original.p_id);
    await expect(form.getByRole("alert")).toHaveText(
      "That didn’t go through. Your entries are still here, so try again.",
    );
    // The sheet stays open with the draft; nothing claims the child was added.
    await expect(childAddDialog(page)).toBeVisible();
    await expect(page.getByTestId("toast")).toHaveCount(0);
    await expect(form.getByLabel("Name", { exact: true })).toHaveValue(
      "Retry child",
    );
    await expect(seat(form, "Booster")).toBeChecked();

    const retryRequest = page.waitForRequest(saveChildRpc);
    await save.click();
    expect((await retryRequest).postDataJSON()).toEqual(original);
    await expectToast(page, "Retry child added");
    await expect(childAddDialog(page)).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Retry child", exact: true }),
    ).toHaveCount(1);
    await expectBlankAddForm(page);
    expect(await storedChildren(page, familyId)).toEqual([
      {
        id: original.p_id,
        display_name: "Retry child",
        seat_requirement: "booster",
        revision: 1,
      },
    ]);
  } finally {
    await context.close();
  }
});

test("legacy child links use the active family and survive sign-in", async ({ browser }) => {
  const { context, page, email } = await account(browser, "legacy-child-link");
  const signedOut = await browser.newContext();
  try {
    await page.goto("/app/children");
    await expect(page).toHaveURL(/\/app\/profile$/);
    const dashboard = await family(page, "Legacy link family", "Guardian");
    const familyId = new URL(dashboard).pathname.split("/").at(-1);
    const legacy = `/app/children?family=${familyId}`;
    for (const path of ["/app/children", legacy, "/app/children?family=malformed"]) {
      await page.goto(path);
      await expect(page).toHaveURL(dashboard);
    }

    await page.goto(`/app/children?family=${crypto.randomUUID()}`);
    await expect(page.getByRole("heading", { name: "Family unavailable" })).toBeVisible();
    await page.getByRole("link", { name: "Open My family" }).click();
    await expect(page).toHaveURL(dashboard);

    const next = await signedOut.newPage();
    await next.goto(legacy);
    await expect(next).toHaveURL(/\/sign-in\?next=/);
    expect(new URL(next.url()).searchParams.get("next")).toBe(legacy);
    await submitSignIn(next, email);
    await expect(next).toHaveURL(dashboard);
  } finally {
    await Promise.all([context.close(), signedOut.close()]);
  }
});
