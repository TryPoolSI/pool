import { useRef, useState } from "react";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { Platform, useWindowDimensions } from "react-native";
import * as UI from "@/ui/elements";
import { CommandForm } from "@/ui/command-form";
import { spacing, styles } from "@/ui/styles";
import type { MembershipState } from "@/lib/membership";
import { membershipAction } from "@/services/membership-actions";

export function MembershipForm({
  command,
  fields = {},
  label,
  children,
  onResult,
  creates,
  disabled,
  tone,
  secondary,
  after,
  successMessage,
}: {
  command: string;
  fields?: Record<string, string>;
  label: string;
  children?: React.ReactNode;
  onResult?: (result: MembershipState) => void;
  creates?: boolean;
  disabled?: boolean;
  tone?: "danger" | "quiet";
  secondary?: boolean;
  after?: "open" | "close" | "toast" | "inline";
  // Names the person or thing in the confirmation ("You joined Oak Street").
  successMessage?: string;
}) {
  const previous = useRef<MembershipState>({});
  return (
    <CommandForm
      action={async (values) => {
        const result = await membershipAction(previous.current, values);
        return successMessage && !result.error
          ? { ...result, message: successMessage }
          : result;
      }}
      fields={{ command, ...fields }}
      label={label}
      onResult={(result) => {
        previous.current = result;
        onResult?.(result);
      }}
      creates={creates}
      disabled={disabled}
      tone={tone}
      secondary={secondary}
      after={after}
    >
      {children}
    </CommandForm>
  );
}

export function NameField({
  label = "Family name",
  name = "name",
  placeholder,
  defaultValue,
}: {
  label?: string;
  name?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <UI.Label>
      {label}
      <UI.Field
        name={name}
        required
        maxLength={80}
        placeholder={placeholder}
        defaultValue={defaultValue}
        autoComplete={name === "display_name" ? "nickname" : "off"}
      />
    </UI.Label>
  );
}

// A destructive action keeps one plain confirmation ("Remove Sam from the
// family"). The service refuses the command without it.
export function ConfirmRemoval({ children }: { children: React.ReactNode }) {
  return (
    <UI.Label className="checkbox-label">
      <UI.Field type="checkbox" name="confirm" value="yes" required />
      {children}
    </UI.Label>
  );
}

function invitationLink(kind: string, token: string) {
  const origin =
    Platform.OS === "web"
      ? globalThis.location?.origin
      : process.env.EXPO_PUBLIC_WEB_ORIGIN ||
        Constants.expoConfig?.extra?.webOrigin;
  return `${origin || "http://localhost:3000"}/app/invitations#kind=${kind}&token=${token}`;
}

// Creating an invitation replaces the form with its link, so the same person
// cannot be invited twice by pressing the button again.
export function InviteForm({
  kind,
  scopeId,
}: {
  kind: "guardian" | "circle";
  scopeId: string;
}) {
  const [created, setCreated] = useState<{ email: string; link: string }>();
  const [copied, setCopied] = useState(false);
  const { width } = useWindowDimensions();
  // Like a form's own button, these span the sheet on a phone.
  const wide = width <= 650 ? ({ alignSelf: "stretch" } as const) : undefined;
  if (created)
    return (
      <UI.Box style={{ gap: spacing.lg, paddingBottom: spacing.sm }}>
        <UI.Paragraph role="status" style={{ marginVertical: 0 }}>
          Send this link yourself. Only {created.email} can use it, and it works
          for 7 days.
        </UI.Paragraph>
        <UI.Label>
          Invitation link
          <UI.Field readOnly value={created.link} />
        </UI.Label>
        <UI.Box style={width <= 650 ? { gap: spacing.sm } : styles.actionRow}>
          <UI.Button
            className="primary"
            style={wide}
            onPress={async () => {
              try {
                await Clipboard.setStringAsync(created.link);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy invitation link"}
          </UI.Button>
          <UI.Button
            className="quiet"
            style={wide}
            onPress={() => {
              setCopied(false);
              setCreated(undefined);
            }}
          >
            Invite someone else
          </UI.Button>
        </UI.Box>
      </UI.Box>
    );
  return (
    <CommandForm
      action={async (values) => {
        const result = await membershipAction(
          {},
          { ...values, command: "create-invitation", kind, scope_id: scopeId },
        );
        if (result.error || !result.token) return result;
        setCreated({
          email: String(values.email ?? "").trim().toLowerCase(),
          link: invitationLink(kind, result.token),
        });
      }}
      label="Create invitation"
    >
      <UI.Label>
        Their email
        <UI.Field
          type="email"
          name="email"
          required
          maxLength={254}
          autoComplete="off"
          placeholder="name@example.com"
        />
      </UI.Label>
    </CommandForm>
  );
}
