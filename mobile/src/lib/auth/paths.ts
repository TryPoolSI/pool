// Return only normalized application paths, never an arbitrary URL. Decode
// repeatedly to reject encoded slashes, controls and dot-segment bypasses too.
export function appReturnPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) return "/app";
  let decoded = value;
  try {
    for (let i = 0; i < 4; i++) {
      if (/[\\\s\u0000-\u001f\u007f]/.test(decoded)) return "/app";
      if (!decoded.startsWith("/app") || !/^\/app(?:\/|\?|$)/.test(decoded))
        return "/app";
      const url = new URL(decoded, "https://pool.invalid");
      if (
        url.origin !== "https://pool.invalid" ||
        !/^\/app(?:\/|$)/.test(url.pathname)
      )
        return "/app";
      const next = decodeURIComponent(decoded);
      if (next === decoded) return url.pathname + url.search;
      decoded = next;
    }
  } catch {
    /* Invalid URL or percent encoding. */
  }
  return "/app";
}

export function emailLinkType(value: unknown): "signup" | "recovery" | null {
  return value === "signup" || value === "recovery" ? value : null;
}

export function validTokenHash(value: unknown): value is string {
  return (
    typeof value === "string" && /^(?:pkce_)?[a-f0-9]{40,128}$/i.test(value)
  );
}
