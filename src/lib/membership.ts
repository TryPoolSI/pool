import type { Fields } from "@/services/fields";
export type MembershipState = {
  error?: string;
  message?: string;
  path?: string;
  token?: string;
  kind?: string;
  preview?: { name: string; expires: string };
};
export function membershipError(code: string) {
  switch (code) {
    case "PT401":
      return "Your session needs attention. Sign in with a confirmed email and try again.";
    case "PT404":
      return "This invitation or membership is unavailable to this account. Check the link and signed-in email.";
    case "PT410":
      return "This invitation has expired, was revoked, or has already been used. Ask for a new link.";
    case "PT409":
      return "This change conflicts with the current membership. The last owner and coordinating family must remain. Reload to see the latest state.";
    case "PT423":
      return "This membership is responsible for an active trip. Finish every child’s handoff before ordinary removal.";
    case "PT400":
      return "Check the names, email address, invitation type and selected family.";
    default:
      return "We could not save this change. Reload and try again.";
  }
}
export function requiredText(data: Fields, name: string, max = 80) {
  const value = data.get(name);
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new Error("validation");
  return value.trim();
}
export function uuid(data: Fields, name: string) {
  const value = requiredText(data, name, 36);
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    throw new Error("validation");
  return value;
}
