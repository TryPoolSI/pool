import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { createClient } from "@/lib/supabase/client";
import { verifiedUser } from "@/lib/auth/identity";
import { appReturnPath } from "@/lib/auth/paths";
import { Paragraph } from "@/ui/elements";
export default function Callback() {
  const { code, next, error } = useLocalSearchParams<{
    code: string;
    next: string;
    error: string;
  }>();
  const [message, setMessage] = useState("Checking your email link…");
  const pending = useRef<{ code: string; result: Promise<boolean> } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    async function exchange() {
      if (error || !code || code.length >= 2048) {
        router.replace("/auth/error");
        return;
      }
      // Development effect replay must not consume a single-use PKCE code twice.
      if (pending.current?.code !== code) {
        pending.current = {
          code,
          result: (async () => {
            const client = createClient();
            const result = await client.auth.exchangeCodeForSession(code);
            return !result.error && Boolean(await verifiedUser(client));
          })(),
        };
      }
      const valid = await pending.current.result;
      if (!active) return;
      if (!valid) router.replace("/auth/error");
      else router.replace(appReturnPath(next) as never);
    }
    void exchange().catch(() => {
      if (active)
        setMessage("This link could not be used. Request another link.");
    });
    return () => {
      active = false;
    };
  }, [code, next, error]);
  return <Paragraph role="status">{message}</Paragraph>;
}
