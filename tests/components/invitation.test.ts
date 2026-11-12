import {
  invitationParts,
  forgetInvitation,
  rememberInvitation,
  pendingInvitation,
} from "@/services/invitation-link";
import * as SecureStore from "expo-secure-store";
beforeEach(() => {
  const values = new Map<string, string>();
  jest
    .mocked(SecureStore.getItemAsync)
    .mockImplementation(async (key) => values.get(key) ?? null);
  jest
    .mocked(SecureStore.setItemAsync)
    .mockImplementation(async (key, value) => {
      values.set(key, value);
    });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
    values.delete(key);
  });
});

test("a malformed new invitation cannot fall back to a previously retained capability", async () => {
  const valid = `https://pool.invalid/app/invitations#kind=guardian&token=${"a".repeat(64)}`;
  expect(invitationParts(valid)).toEqual({
    kind: "guardian",
    token: "a".repeat(64),
  });
  await rememberInvitation(valid);
  expect(await pendingInvitation()).toBe(valid);
  await rememberInvitation(
    "https://pool.invalid/app/invitations#kind=guardian&token=invalid",
  );
  expect(await pendingInvitation()).toBe("");
});

test("accepting one invitation leaves a newer native link available", async () => {
  const acceptedToken = "a".repeat(64);
  const nextToken = "b".repeat(64);
  const original = `https://pool.invalid/app/invitations#kind=guardian&token=${acceptedToken}`;
  const next = `pool:///app/invitations#kind=circle&token=${nextToken}`;
  await rememberInvitation(original);
  const finishing = forgetInvitation(acceptedToken);
  await rememberInvitation(next);
  await finishing;
  expect(await pendingInvitation()).toBe(next);
  expect(invitationParts(next)).toEqual({ kind: "circle", token: nextToken });
  await forgetInvitation(nextToken);
  expect(await pendingInvitation()).toBe("");
});
