import { INVITATIONS_PATH } from "@/lib/auth/paths";
import { storage } from "@/lib/supabase/storage";

const key = "pool-pending-invitation";
const listeners = new Set<(value: string) => void>();
let currentLink: string | undefined;
let writes = Promise.resolve();

function invitationUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (
      url.pathname === INVITATIONS_PATH &&
      (url.protocol === "http:" ||
        url.protocol === "https:" ||
        (url.protocol === "pool:" && !url.host))
    )
      return url;
  } catch {
    // A pasted link must be a complete URL.
  }
  return null;
}

export function isInvitationLink(value: string) {
  return Boolean(invitationUrl(value)?.hash);
}

export function invitationParts(value: string) {
  const url = invitationUrl(value);
  if (!url || url.search || url.username || url.password) return null;
  const query = new URLSearchParams(url.hash.slice(1));
  const kind = query.get("kind");
  const token = query.get("token");
  return (kind === "guardian" || kind === "circle") &&
    token &&
    /^[a-f0-9]{64}$/.test(token) &&
    query.getAll("kind").length === 1 &&
    query.getAll("token").length === 1
    ? { kind, token }
    : null;
}

export function onInvitation(callback: (value: string) => void) {
  listeners.add(callback);
  if (currentLink !== undefined) callback(currentLink);
  else {
    void pendingInvitation()
      .then((value) => {
        if (listeners.has(callback) && currentLink === undefined)
          callback(value);
      })
      .catch(() => {});
  }
  return () => {
    listeners.delete(callback);
  };
}

function saveInvitation(link: string) {
  currentLink = link;
  const write = writes.then(async () => {
    if (invitationParts(link)) await storage.setItem(key, link);
    else await storage.removeItem(key);
  });
  writes = write.catch(() => {});
  return write;
}

export function rememberInvitation(value: string) {
  const link = value.trim();
  const write = saveInvitation(link);
  listeners.forEach((callback) => callback(link));
  return write;
}

export async function pendingInvitation() {
  const stored = currentLink ?? (await storage.getItem(key)) ?? "";
  const link = currentLink ?? stored;
  return invitationParts(link) ? link : "";
}

export async function forgetInvitation(token: string) {
  const stored = await pendingInvitation();
  const link = currentLink ?? stored;
  if (invitationParts(link)?.token === token) await saveInvitation("");
}
