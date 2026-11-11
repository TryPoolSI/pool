import { authLock } from "./auth-lock";
import "react-native-url-polyfill/auto";
import {
  createClient as supabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { publicConfig } from "./config";
import { storage } from "./storage";
import type { Database } from "./database.types";
let client: SupabaseClient<Database> | undefined;
let emailActionClient: SupabaseClient<Database> | undefined;
export function createClient() {
  if (!client) {
    const { url, key } = publicConfig();
    client = supabaseClient<Database>(url, key, {
      auth: {
        ...authLock,
        storage,
        storageKey: "pool-auth-v2",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
  }
  return client;
}

export function createEmailActionClient() {
  if (!emailActionClient) {
    const { url, key } = publicConfig();
    // OTP verification can return a session. Keep it separate from Pool's
    // signed-in account, including sessions in other tabs.
    emailActionClient = supabaseClient<Database>(url, key, {
      auth: {
        storageKey: "pool-email-action",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        skipAutoInitialize: true,
        flowType: "implicit",
      },
    });
  }
  return emailActionClient;
}
