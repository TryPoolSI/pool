import type { SupabaseClient, User } from "@supabase/supabase-js";

export function isConfirmedEmailUser(user: User | null): user is User {
  return Boolean(user?.email && user.email_confirmed_at && !user.is_anonymous);
}

export async function verifiedUser(client: SupabaseClient) {
  // Never authorize from getSession() or the user object stored in a cookie.
  const { data, error } = await client.auth.getUser();
  const user = data.user;
  return !error && isConfirmedEmailUser(user) ? user : null;
}
