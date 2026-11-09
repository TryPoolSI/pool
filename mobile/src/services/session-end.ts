export type SessionEndReason = "signed-out" | "password-updated";
let pending: SessionEndReason | undefined;

export function beginSessionEnd(reason: SessionEndReason) {
  pending = reason;
  return () => {
    if (pending === reason) pending = undefined;
  };
}
export function sessionEndReason() {
  return pending;
}
