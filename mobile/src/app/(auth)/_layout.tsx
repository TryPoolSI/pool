import { Slot } from "expo-router";
import { AuthShell } from "@/ui/shell";
export default function AuthLayout() {
  return (
    <AuthShell>
      <Slot />
    </AuthShell>
  );
}
