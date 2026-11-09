import type { TextInputProps } from "react-native";

// Native Done ends editing. Commands remain explicit primary-button actions.
export const submitOnReturn = false;
export const keyboardInputProps: Pick<
  TextInputProps,
  "returnKeyType" | "submitBehavior" | "inputAccessoryViewButtonLabel"
> = {
  returnKeyType: "done",
  submitBehavior: "blurAndSubmit",
  inputAccessoryViewButtonLabel: "Done",
};
