import { storage } from "@/lib/supabase/storage";
const key = "pool-pending-invitation";
const listeners = new Set<(value: string) => void>();
export function onInvitation(callback: (value: string) => void) {
  listeners.add(callback);
  void pendingInvitation().then(callback);
  return () => {
    listeners.delete(callback);
  };
}
export function invitationParts(value: string) {
  try {
    const fragment = new URL(value, "https://pool.invalid").hash.slice(1);
    const query = new URLSearchParams(fragment);
    const kind = query.get("kind"),
      token = query.get("token");
    return (kind === "guardian" || kind === "circle") &&
      token &&
      /^[a-f0-9]{64}$/.test(token)
      ? { kind, token }
      : null;
  } catch {
    return null;
  }
}
export async function rememberInvitation(value: string) {
  if (invitationParts(value)) await storage.setItem(key, value);
  else await storage.removeItem(key);
  listeners.forEach((callback) => callback(value));
}
export async function pendingInvitation() {
  return (await storage.getItem(key)) ?? "";
}
export async function forgetInvitation() {
  await storage.removeItem(key);
}
