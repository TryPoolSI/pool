import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { AuthForm, ResendConfirmation } from "@/features/auth/auth-form";
import { resendConfirmation, signIn } from "@/services/auth";

jest.mock("@/services/auth", () => ({
  signIn: jest.fn(),
  signUp: jest.fn(),
  resendConfirmation: jest.fn(),
  requestRecovery: jest.fn(),
  resetPassword: jest.fn(),
  signOut: jest.fn(),
}));

const sendAgain = () => screen.queryByRole("button", { name: "Send it again" });
const sent =
  "If this address still needs confirmation, check your inbox and spam folder for the latest link.";

async function trySignIn(email: string) {
  await fireEvent.changeText(screen.getByLabelText("Email address"), email);
  await fireEvent.changeText(screen.getByLabelText("Password"), "a-password");
  await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
}

test("sign-up and sign-in offer nothing to send again until an email is outstanding", async () => {
  const signUp = await render(<AuthForm mode="sign-up" />);
  expect(sendAgain()).toBeNull();
  expect(screen.queryByText("Resend confirmation email")).toBeNull();
  await signUp.unmount();
  await render(<AuthForm mode="sign-in" />);
  expect(sendAgain()).toBeNull();
  expect(screen.queryByText("Resend confirmation email")).toBeNull();
});

test("sign-in offers to send the email again only for an unconfirmed address, and keeps what was typed", async () => {
  jest.mocked(signIn).mockResolvedValue({
    error: "That email and password didn’t work.",
  });
  jest.mocked(resendConfirmation).mockResolvedValue({ message: sent });
  await render(<AuthForm mode="sign-in" />);
  await trySignIn("Pat@Example.test ");
  await screen.findByText("That email and password didn’t work.");
  expect(sendAgain()).toBeNull();

  jest.mocked(signIn).mockResolvedValue({
    error: "Confirm your email first.",
    unconfirmed: true,
  });
  await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("Didn’t receive the email?");
  expect(screen.getByLabelText("Email address").props.value).toBe(
    "Pat@Example.test ",
  );
  await fireEvent.press(sendAgain()!);
  await screen.findByText(sent);
  // It goes to the address the refused sign-in used, without asking again.
  expect(jest.mocked(resendConfirmation)).toHaveBeenCalledTimes(1);
  expect(jest.mocked(resendConfirmation).mock.calls[0][1].get("email")).toBe(
    "pat@example.test",
  );

  // An ordinary failure afterwards takes the offer away again.
  jest.mocked(signIn).mockResolvedValue({
    error: "That email and password didn’t work.",
  });
  await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(sendAgain()).toBeNull());
});

test("sending again is off while a request is on its way and reports a failure plainly", async () => {
  let finish: (state: { error?: string; message?: string }) => void = () => {};
  jest.mocked(resendConfirmation).mockReset();
  jest
    .mocked(resendConfirmation)
    .mockImplementation(() => new Promise((resolve) => (finish = resolve)));
  await render(<ResendConfirmation email="pat@example.test" />);
  await fireEvent.press(sendAgain()!);
  await waitFor(() =>
    expect(sendAgain()!.props.accessibilityState.disabled).toBe(true),
  );
  await fireEvent.press(sendAgain()!);
  expect(jest.mocked(resendConfirmation)).toHaveBeenCalledTimes(1);
  finish({ error: "Check your connection and try again." });
  await screen.findByText("Check your connection and try again.");
  expect(sendAgain()!.props.accessibilityState.disabled).toBe(false);
});
