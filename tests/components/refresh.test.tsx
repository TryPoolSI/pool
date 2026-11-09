import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react-native";
import { createPanel } from "@/ui/remote";
import { CommandForm } from "@/ui/command-form";
import { Label, Field } from "@/ui/elements";

jest.mock("@/services/session", () => ({
  useSession: () => ({ user: { id: "adult" }, ready: true }),
}));

test("a failed background refresh retains the mounted draft and request identity", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const load = jest.fn().mockResolvedValue({ model: { request: "original" } });
  const action = jest
    .fn()
    .mockResolvedValue({ error: "Please refresh before saving." });
  const Panel = createPanel(
    "draft",
    load,
    ({ request }: { request: string }) => (
      <CommandForm
        action={action}
        fields={{ request_id: request }}
        label="Save"
      >
        <Label>
          Child display name
          <Field name="display_name" required />
        </Label>
      </CommandForm>
    ),
  );
  await render(
    <QueryClientProvider client={client}>
      <Panel />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Child display name")).toBeTruthy(),
  );
  await fireEvent.changeText(
    screen.getByLabelText("Child display name"),
    "Draft child",
  );
  load.mockRejectedValueOnce(new Error("Network unavailable"));
  await act(async () => {
    await client.invalidateQueries();
  });
  await waitFor(() =>
    expect(
      screen.getByText(/Displayed information may be out of date/),
    ).toBeTruthy(),
  );
  expect(screen.getByLabelText("Child display name").props.value).toBe(
    "Draft child",
  );
  load.mockResolvedValue({ model: { request: "new-query-value" } });
  await fireEvent.press(screen.getByRole("button", { name: "Retry refresh" }));
  await waitFor(() =>
    expect(
      screen.queryByText(/Displayed information may be out of date/),
    ).toBeNull(),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith({
      request_id: "original",
      display_name: "Draft child",
    }),
  );
  client.clear();
});
