export function publicConfig() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error(
      "Configure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  if (!/^https?:\/\//.test(url))
    throw new Error("Supabase URL must use HTTP or HTTPS.");
  return { url, key };
}
