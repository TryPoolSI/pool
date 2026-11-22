import * as Haptics from "expo-haptics";

// A light tap for commitments and selections. Failures are silent: haptics are
// an extra, never a requirement.
export function tap() {
  void Haptics.selectionAsync().catch(() => {});
}
export function success() {
  void Haptics.notificationAsync(
    Haptics.NotificationFeedbackType.Success,
  ).catch(() => {});
}
