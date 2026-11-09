import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { CommandForm } from "@/ui/command-form";
import { Label, Field } from "@/ui/elements";
import { storage } from "@/lib/supabase/storage";
import * as SecureStore from "expo-secure-store";
test("a failed command keeps its draft and stable request identity; explicit consent is required", async () => {
  const action = jest
    .fn()
    .mockResolvedValue({ error: "The plan changed. Refresh and try again." });
  await render(
    <CommandForm
      action={action}
      fields={{ ride_id: "stable-request" }}
      label="Save"
    >
      <Label>
        Child display name
        <Field name="display_name" required />
      </Label>
      <Label className="checkbox-label">
        <Field name="confirm" type="checkbox" value="yes" required />I
        explicitly consent.
      </Label>
    </CommandForm>,
  );
  await fireEvent.changeText(
    screen.getByLabelText("Child display name"),
    "Pat",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Save" }));
  expect(action).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole("checkbox", { name: "I explicitly consent." }),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith({
      ride_id: "stable-request",
      display_name: "Pat",
      confirm: "yes",
    }),
  );
  expect(screen.getByLabelText("Child display name").props.value).toBe("Pat");
  await fireEvent.press(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  expect(action.mock.calls[1][0].ride_id).toBe("stable-request");
});
test("native session storage round-trips large sessions and removes all token chunks", async () => {
  const values = new Map<string, string>();
  jest
    .mocked(SecureStore.getItemAsync)
    .mockImplementation(async (key) => values.get(key) ?? null);
  jest
    .mocked(SecureStore.setItemAsync)
    .mockImplementation(async (key, value) => {
      values.set(key, value);
    });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
    values.delete(key);
  });
  const session = JSON.stringify({
    access_token: "x".repeat(9000),
    refresh_token: "refresh",
  });
  await storage.setItem("session", session);
  expect(await storage.getItem("session")).toBe(session);
  expect([...values.values()].every((value) => value.length <= 1500)).toBe(
    true,
  );
  await storage.setItem("session", "new-session");
  expect(await storage.getItem("session")).toBe("new-session");
  await storage.removeItem("session");
  expect(values.size).toBe(0);
});
