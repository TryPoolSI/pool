import {
  invitationParts,
  rememberInvitation,
  pendingInvitation,
} from "@/services/invitation-link";
import * as SecureStore from "expo-secure-store";
test("a malformed new invitation cannot fall back to a previously retained capability", async () => {
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
