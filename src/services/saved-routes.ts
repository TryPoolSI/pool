import { useQuery } from "@tanstack/react-query";
import { verifiedUser } from "@/lib/auth/identity";
import { requiredText, uuid } from "@/lib/membership";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { queryClient } from "./cache";
import { Fields, type CommandInput } from "./fields";
import { useSession } from "./session";

export type RouteLocations = Pick<
  Database["public"]["Tables"]["saved_routes"]["Row"],
  "pickup_summary" | "destination_summary" | "pickup" | "destination"
>;

function savedRoutesKey(userId: string | undefined, familyId: string) {
  return ["account", userId, "saved-routes", familyId] as const;
}

export function useSavedRoutes(familyId: string) {
  const { user, ready, error } = useSession();
  return useQuery({
    queryKey: savedRoutesKey(user?.id, familyId),
    enabled: Boolean(user && ready && !error),
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const result = await createClient()
        .from("saved_routes")
        .select("id,name,pickup_summary,destination_summary,pickup,destination")
        .eq("family_id", familyId)
        .order("name")
        .abortSignal(signal);
      if (result.error) throw result.error;
      return result.data;
    },
  });
}

export async function saveRoute(input: CommandInput) {
  const fields = new Fields(input);
  const client = createClient();
  const user = await verifiedUser(client);
  if (!user) return { error: "Sign in again, then try once more." };

  const invalid = {
    error: "Add a route name and two different places.",
  };
  let args: Database["public"]["Functions"]["save_route"]["Args"];
  try {
    args = {
      p_family_id: uuid(fields, "family_id"),
      p_id: uuid(fields, "request_id"),
      p_name: requiredText(fields, "route_name"),
      p_pickup_summary: requiredText(fields, "pickup_summary"),
      p_destination_summary: requiredText(fields, "destination_summary"),
      p_pickup: requiredText(fields, "pickup", 300),
      p_destination: requiredText(fields, "destination", 300),
    };
  } catch {
    return invalid;
  }
  if (args.p_pickup === args.p_destination) return invalid;

  const result = await client.rpc("save_route", args);
  switch (result.error?.code) {
    case "PT401":
      return { error: "Sign in again, then try once more." };
    case "PT404":
      return { error: "Saved routes aren’t available for your family." };
    case "PT400":
    case "23514":
      return invalid;
    case "23505":
      return {
        error: "You already have a route with that name. Pick another.",
      };
    case "PT409":
      return {
        error: "That didn’t go through. Close this and try saving the route again.",
      };
  }
  if (result.error || result.data !== args.p_id)
    return {
      error: "That didn’t go through. Your entries are still here, so try again.",
    };

  void queryClient.invalidateQueries({
    queryKey: savedRoutesKey(user.id, args.p_family_id),
  });
  return { message: "Route saved" };
}
