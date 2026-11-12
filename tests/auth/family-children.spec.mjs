import { expect, test } from "@playwright/test";
import {
  account,
  addChild,
  childAddForm,
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

test("My family adds two children consecutively and edits each child in place", async ({
  browser,
}) => {
  const { context, page } = await account(browser, "child-roster");
  try {
    const dashboard = await family(page, "Child roster family", "Guardian");
    const familyId = new URL(dashboard).pathname.split("/").at(-1);
    const form = childAddForm(page);
    await expect(form.getByLabel("Child display name")).toBeVisible();
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
      await addChild(page, "Zoe", "child-seat");
      await requested;
      await expect(form.getByLabel("Child display name")).toHaveValue("");
      await expect(form.getByLabel("Seat requirement")).toHaveValue("standard");
      await expect(
        page.getByRole("group", { name: "Zoe", exact: true }).getByText("Child seat"),
      ).toBeVisible();
    } finally {
      refresh.resolve();
    }

    await addChild(page, "Ari", "booster");
    await expect(form.getByLabel("Child display name")).toHaveValue("");
    await expect(form.getByLabel("Seat requirement")).toHaveValue("standard");
    await expect(page.getByRole("heading", { name: /^(Ari|Zoe)$/ })).toHaveText([
      "Ari",
      "Zoe",
    ]);
    await expect(
      page.getByRole("group", { name: "Ari", exact: true }).getByText("Booster seat"),
    ).toBeVisible();
    const [ari, zoe] = await storedChildren(page, familyId);
    expect(ari.id).not.toBe(zoe.id);

    for (const [child, name, seat, seatLabel] of [
      [ari, "Ari updated", "standard", "Standard passenger seat"],
      [zoe, "Zoe updated", "booster", "Booster seat"],
    ]) {
      await openAction(page, `Edit ${child.display_name}`);
      const dialog = page.getByRole("dialog", { name: /^Edit / });
      const displayName = dialog.getByLabel("Child display name");
      const seatRequirement = dialog.getByLabel("Seat requirement");
      await expect(displayName).toHaveValue(child.display_name);
      await expect(seatRequirement).toHaveValue(child.seat_requirement);
      await displayName.fill(name);
      await seatRequirement.selectOption(seat);
      await dialog.getByRole("button", { name: "Update child" }).click();
      await expect(dialog.getByRole("status")).toHaveText("Child updated");
      await dialog.getByRole("button", { name: "Done", exact: true }).click();
      await expect(
        page.getByRole("group", { name, exact: true }).getByText(seatLabel),
      ).toBeVisible();
    }
    expect(await storedChildren(page, familyId)).toEqual([
      { ...ari, display_name: "Ari updated", seat_requirement: "standard", revision: 2 },
      { ...zoe, display_name: "Zoe updated", seat_requirement: "booster", revision: 2 },
    ]);
    await expect(page).toHaveURL(dashboard);

    await openAction(page, "Edit Ari updated");
    const dialog = page.getByRole("dialog", { name: /^Edit / });
    const displayName = dialog.getByLabel("Child display name");
    await displayName.fill("Guardian draft");
    const concurrentEdit = await authenticatedRpc(page, "save_own_child", {
      p_id: ari.id,
      p_family_id: familyId,
      p_display_name: "Ari changed elsewhere",
      p_seat_requirement: "standard",
      p_revision: 2,
    });
    expect(concurrentEdit.ok()).toBe(true);
    await dialog.getByRole("button", { name: "Update child" }).click();
    await expect(dialog.getByRole("alert")).toContainText("details changed");
    await expect(displayName).toHaveValue("Guardian draft");
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Ari changed elsewhere", exact: true }),
    ).toBeVisible();
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
    const form = childAddForm(page);
    await form.getByLabel("Child display name").fill("Retry child");
    await form.getByLabel("Seat requirement").selectOption("booster");
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
    const save = form.getByRole("button", { name: "Save child", exact: true });
    const firstRequest = page.waitForRequest(saveChildRpc);
    await save.click();
    const original = (await firstRequest).postDataJSON();
    expect(await committed.promise).toBe(original.p_id);
    await expect(form.getByRole("alert")).toContainText("Retry with the same details");
    await expect(form.getByLabel("Child display name")).toHaveValue("Retry child");
    await expect(form.getByLabel("Seat requirement")).toHaveValue("booster");

    const retryRequest = page.waitForRequest(saveChildRpc);
    await save.click();
    expect((await retryRequest).postDataJSON()).toEqual(original);
    await expect(form.getByRole("status")).toHaveText("Child added");
    await expect(form.getByLabel("Child display name")).toHaveValue("");
    await expect(
      page.getByRole("heading", { name: "Retry child", exact: true }),
    ).toHaveCount(1);
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
