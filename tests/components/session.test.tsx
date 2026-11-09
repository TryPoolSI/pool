import { useEffect } from "react";
import { Text } from "react-native";
import {
  render,
  screen,
  waitFor,
  act,
  fireEvent,
} from "@testing-library/react-native";
import { SessionProvider, useSession } from "@/services/session";
import { createClient } from "@/lib/supabase/client";
import { beginSessionEnd } from "@/services/session-end";
import { createScreen } from "@/ui/remote";
import { queryClient } from "@/services/cache";
afterEach(() => queryClient.clear());
jest.mock("@/services/cache", () => {
  const { QueryClient } = jest.requireActual("@tanstack/react-query");
  return {
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    }),
  };
});
jest.mock("@/lib/supabase/client", () => ({ createClient: jest.fn() }));
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { addEventListener: () => () => {} },
}));
test("foreground SIGNED_IN for the same verified adult retains drafts; sign-out removes protected content", async () => {
  let callback: (event: string, session: unknown) => void = () => {};
  let user: Record<string, unknown> | null = {
    id: "adult",
    email: "adult@example.test",
    email_confirmed_at: "confirmed",
    is_anonymous: false,
  };
  let mounts = 0;
  jest.mocked(createClient).mockReturnValue({
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      onAuthStateChange: (listener: typeof callback) => {
        callback = listener;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
    },
  } as unknown as ReturnType<typeof createClient>);
  function Draft() {
    useEffect(() => {
      mounts++;
    }, []);
    return <Text>Draft still here</Text>;
  }
  function Protected() {
    const { ready, user, ended } = useSession();
    return ready && user ? (
      <Draft />
    ) : (
      <Text>{ended ?? "Signed out or checking"}</Text>
    );
  }
  await render(
    <SessionProvider>
      <Protected />
    </SessionProvider>,
  );
  await waitFor(() =>
    expect(screen.getByText("Draft still here")).toBeTruthy(),
  );
  expect(mounts).toBe(1);
  await act(async () => {
    callback("SIGNED_IN", { user });
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await waitFor(() =>
    expect(screen.getByText("Draft still here")).toBeTruthy(),
  );
  expect(mounts).toBe(1);
  user = null;
  await act(async () => {
    const finish = beginSessionEnd("signed-out");
    callback("SIGNED_OUT", null);
    finish();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await waitFor(() =>
    expect(screen.queryByText("Draft still here")).toBeNull(),
  );
  expect(screen.getByText("signed-out")).toBeTruthy();
});

test("a thrown secure-session read shows a recoverable error and never loads private data", async () => {
  const user = {
    id: "adult",
    email: "adult@example.test",
    email_confirmed_at: "confirmed",
    is_anonymous: false,
  };
  const getUser = jest
    .fn()
    .mockRejectedValueOnce(new Error("ERR_KEY_CHAIN"))
    .mockResolvedValue({ data: { user }, error: null });
  jest.mocked(createClient).mockReturnValue({
    auth: {
      getUser,
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
    },
  } as unknown as ReturnType<typeof createClient>);
  const load = jest.fn(async () => ({ model: "Verified account" }));
  const Screen = createScreen(load, (model) => <Text>{model}</Text>);
  await render(
    <SessionProvider>
      <Screen />
    </SessionProvider>,
  );
  await waitFor(() =>
    expect(
      screen.getByText(/Your saved session could not be read/),
    ).toBeTruthy(),
  );
  expect(load).not.toHaveBeenCalled();
  expect(screen.queryByText("Loading your current information…")).toBeNull();
  await fireEvent.press(screen.getByText("Retry session"));
  await waitFor(() =>
    expect(screen.getByText("Verified account")).toBeTruthy(),
  );
  expect(getUser).toHaveBeenCalledTimes(2);
  expect(load).toHaveBeenCalledTimes(1);
});
