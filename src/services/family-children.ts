import type { Database } from "@/lib/supabase/database.types";

export type FamilyChild = Pick<
  Database["public"]["Tables"]["children"]["Row"],
  "id" | "display_name" | "seat_requirement" | "revision"
>;

export const seatRequirements = {
  standard: "Standard passenger seat",
  booster: "Booster seat",
  "child-seat": "Child seat",
};

export function familyChildrenKey(accountId: string, familyId: string) {
  return ["account", accountId, "family-children", familyId] as const;
}

export function compareChildren(first: FamilyChild, second: FamilyChild) {
  return (
    first.display_name.localeCompare(second.display_name) ||
    first.id.localeCompare(second.id)
  );
}
