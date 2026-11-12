import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "./session";

export type ActiveFamily = { id: string; name: string; role: string };

export async function loadActiveFamily(
  client: ReturnType<typeof createClient>,
  userId: string,
  signal?: AbortSignal,
): Promise<ActiveFamily | null> {
  const query = client
    .from("family_members")
    .select("role,families(id,name)")
    .eq("user_id", userId)
    .is("removed_at", null);
  if (signal) query.abortSignal(signal);
  const { data, error } = await query.maybeSingle();
  if (error || (data && !data.families))
    throw new Error("Your family membership could not be loaded.");
  return data?.families ? { ...data.families, role: data.role } : null;
}

export function useActiveFamily() {
  const { user, ready, error } = useSession();
  return useQuery({
    queryKey: ["account", user?.id, "active-family"],
    enabled: Boolean(user && ready && !error),
    queryFn: ({ signal }) => loadActiveFamily(createClient(), user!.id, signal),
  });
}

export function familyPath(id: string) {
  return `/app/families/${id}` as const;
}
