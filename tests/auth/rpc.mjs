import { expect } from "@playwright/test";
export async function sessionToken(context) {
  const page = context.pages()[0];
  return page.evaluate(() => {
    const value = localStorage.getItem("pool-auth-v2");
    return value ? JSON.parse(value).access_token : null;
  });
}
export async function replayRpc(captured, context, expected) {
  const token = await sessionToken(context);
  const headers = {
    apikey: captured.headers.apikey,
    "content-type": "application/json",
    authorization: `Bearer ${token ?? ""}`,
  };
  const response = await context.request.post(captured.url, {
    data: captured.body ?? captured.data,
    headers,
  });
  expect(response.ok()).toBe(false);
  const error = await response.json();
  expect(["PT401", "PT404", "PT409", "PT410", "PT423", "42501"]).toContain(
    error.code,
  );
  if (expected === "unavailable")
    expect(["PT401", "PT404"]).toContain(error.code);
}
const writes = new Set([
  "save_own_child",
  "create_ride",
  "respond_to_ride_invitation",
  "set_own_ride_riders",
  "cancel_ride",
  "save_vehicle",
  "propose_driver",
  "request_replacement",
  "accept_driver_proposal",
  "consent_for_own_children",
  "revoke_own_consent",
  "decline_driver_proposal",
  "cancel_driver_proposal",
  "withdraw_driver",
  "designate_recipient",
  "record_pickup",
  "report_arrival",
  "confirm_handoff",
]);
function mutation(request) {
  return (
    request.method() === "POST" &&
    writes.has(new URL(request.url()).pathname.split("/").at(-1))
  );
}
export async function captureRpc(page, click) {
  let resolve;
  const captured = new Promise((r) => {
    resolve = r;
  });
  await page.route("**/rest/v1/rpc/**", async (route) => {
    const request = route.request();
    if (mutation(request)) {
      resolve({
        url: request.url(),
        body: request.postDataBuffer(),
        headers: request.headers(),
      });
      await route.abort();
    } else await route.continue();
  });
  let timer;
  try {
    await click();
    return await Promise.race([
      captured,
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "No mutation RPC was submitted; inspect form validation.",
              ),
            ),
          10000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    await page.unroute("**/rest/v1/rpc/**");
  }
}
export async function replayDenied(page, context, click) {
  const post = await captureRpc(page, click);
  await replayRpc(post, context, "unavailable");
}
export async function privateChildId(page, name) {
  const token = await sessionToken(page.context());
  const response = await page.request.get(
    `http://localhost:55321/rest/v1/children?select=id&display_name=eq.${encodeURIComponent(name)}`,
    {
      headers: {
        apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${token}`,
      },
    },
  );
  expect(response.ok()).toBe(true);
  return (await response.json())[0].id;
}
export async function tamperNextRpc(page, fields) {
  await page.route("**/rest/v1/rpc/**", async (route) => {
    const request = route.request();
    if (!mutation(request)) {
      await route.continue();
      return;
    }
    await page.unroute("**/rest/v1/rpc/**");
    await route.continue({
      postData: JSON.stringify({ ...request.postDataJSON(), ...fields }),
    });
  });
}
export async function authenticatedRpc(page, name, data) {
  const token = await sessionToken(page.context());
  return page.request.post(`http://localhost:55321/rest/v1/rpc/${name}`, {
    headers: {
      apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
    },
    data,
  });
}
export async function ownChild(page, name) {
  const token = await sessionToken(page.context());
  const response = await page.request.get(
    `http://localhost:55321/rest/v1/children?select=id,family_id,revision&display_name=eq.${encodeURIComponent(name)}`,
    {
      headers: {
        apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${token}`,
      },
    },
  );
  expect(response.ok()).toBe(true);
  return (await response.json())[0];
}
