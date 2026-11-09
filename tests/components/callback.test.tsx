import { StrictMode } from "react";
import { render, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import Callback from "@/app/auth/callback";
import { createClient } from "@/lib/supabase/client";

jest.mock("expo-router", () => ({
  router: { replace: jest.fn() },
  useLocalSearchParams: () => ({ code: "one-use-code", next: "/app/schedule" }),
}));
jest.mock("@/lib/supabase/client", () => ({ createClient: jest.fn() }));

test("development effect replay exchanges a PKCE code once and navigates after verification", async () => {
  const exchange = jest.fn().mockResolvedValue({ error: null });
  jest.mocked(createClient).mockReturnValue({
    auth: {
      exchangeCodeForSession: exchange,
      getUser: async () => ({
        data: {
          user: {
            id: "adult",
            email: "adult@example.test",
            email_confirmed_at: "confirmed",
            is_anonymous: false,
          },
        },
        error: null,
      }),
    },
  } as unknown as ReturnType<typeof createClient>);
  await render(
    <StrictMode>
      <Callback />
    </StrictMode>,
  );
  await waitFor(() =>
    expect(router.replace).toHaveBeenCalledWith("/app/schedule"),
  );
  expect(exchange).toHaveBeenCalledTimes(1);
});
