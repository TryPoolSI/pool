import type { SupabaseClient } from "@supabase/supabase-js";

export async function verifiedUser(client: SupabaseClient) {
  // Never authorize from getSession() or the user object stored in a cookie.
  const { data, error } = await client.auth.getUser();
  const user = data.user;
  return !error && user?.email && user.email_confirmed_at && !user.is_anonymous
    ? user
    : null;
}
