const internal = process.argv.includes("--internal");
const baseUrl = internal
  ? process.env.SUPABASE_INTERNAL_URL || process.env.EXPO_PUBLIC_SUPABASE_URL
  : process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!baseUrl || !publishableKey) {
  console.error(
    "Set the Supabase URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local first.",
  );
  process.exit(1);
}

try {
  // The PostgREST root requires an admin key. Auth settings accepts a public key
  // without requiring an application schema or creating user data.
  for (const endpoint of ["/auth/v1/health", "/auth/v1/settings"]) {
    const response = await fetch(new URL(endpoint, baseUrl), {
      headers: { apikey: publishableKey },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`${endpoint} returned HTTP ${response.status}`);
    }

    console.log(
      `${internal ? "Container" : "Public"} Supabase ${endpoint}: OK`,
    );
  }

  console.log(
    "Supabase Auth connectivity verified. Database queries and row-level security are not checked.",
  );
} catch (error) {
  console.error("Supabase connectivity check failed:", error.message);
  process.exitCode = 1;
}
