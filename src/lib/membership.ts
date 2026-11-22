import type { Fields } from "@/services/fields";
export type MembershipState = {
  error?: string;
  issue?: "invite-unavailable" | "active-family" | "retry-membership";
  message?: string;
  path?: string;
  token?: string;
  kind?: string;
  preview?: { name: string; expires: string };
};
// Every message says what happened and what to do next (DESIGN.md, Language).
export const invitationNotFound =
  "Pool couldn’t find an invitation for this link and this account. Either the link is incomplete, or you’re signed in with a different email than the one that was invited.";
export function membershipError(
  code: string,
  reason?: string,
  invitationKind?: "guardian" | "circle",
) {
  switch (code) {
    case "PT401":
      return "You’ve been signed out. Sign in again with a confirmed email, then try once more.";
    case "PT404":
      return "That’s no longer available to your account. Go back and try again.";
    case "PT410":
      return "This invitation has expired, was revoked or was already used. Ask for a new link.";
    case "PT409":
      if (reason === "active_family_exists") {
        if (invitationKind === "guardian")
          return "You already belong to a family, so this invitation hasn’t been used. To join this one, leave your current family first. You can’t leave while you’re its only owner or it organizes a circle.";
        if (invitationKind === "circle")
          return "You already belong to a family. If you own it, try again and it will join the circle. If you don’t, ask the circle’s organizer to invite your family’s owner.";
        return "You already belong to a family. Open My family to manage it.";
      }
      if (reason === "already_member" && invitationKind)
        return invitationKind === "guardian"
          ? "You’re already in this family."
          : "Your family is already in this circle.";
      return "That can’t be done right now. A family needs at least one owner, and the family that organizes a circle has to stay in it.";
    case "PT423":
      return "A ride is in progress. Wait until every child has been dropped off, then try again.";
    case "PT400":
      return "Something is missing or not quite right. Check the names and the email address, then try again.";
    default:
      return "That didn’t go through. Check your connection and try again.";
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
