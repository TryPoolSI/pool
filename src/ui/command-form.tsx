import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  Form,
  Fieldset,
  Paragraph,
  Button,
  Label,
  Field,
  Box,
} from "./elements";
import Link from "./link";
import { Navigation } from "@/lib/navigation";
import { Fields, type CommandInput } from "@/services/fields";
import { OutcomeFocus } from "@/features/app/outcome-focus";
import { useSheet } from "@/features/app/action-dialog";
import { useToast } from "./toast";
import type { MembershipState } from "@/lib/membership";
export function CommandForm({
  action,
  fields = {},
  label,
  children,
  creates = false,
  disabled = false,
  onResult,
  focusTarget,
  resetOnSuccess = false,
  renderMessage,
  secondary = false,
  tone,
  after,
  compact = false,
}: {
  action: (fields: CommandInput) => Promise<MembershipState | void>;
  fields?: CommandInput;
  label: string;
  children?: ReactNode;
  creates?: boolean;
  disabled?: boolean;
  focusTarget?: string;
  onResult?: (result: MembershipState) => void;
  resetOnSuccess?: boolean;
  renderMessage?: (message: string) => ReactNode;
  // Lower-emphasis submit for pages that already have a primary action (ADR-002).
  secondary?: boolean;
  // "danger" for destructive commits, "quiet" for low-emphasis ones.
  tone?: "danger" | "quiet";
  // What happens after success. Defaults: a created thing opens, a form in a
  // sheet closes it, anything else confirms inline beside the button.
  //   "open"   replace this screen with result.path, and toast
  //   "close"  close the surrounding sheet, and toast
  //   "toast"  stay put and toast (the form's own surface is about to change)
  //   "inline" stay put and show the message under the button
  after?: "open" | "close" | "toast" | "inline";
  // A lone button with no fields (a one-tap step in a list row): no margins.
  compact?: boolean;
}) {
  const sheet = useSheet();
  const toast = useToast();
  const [state, setState] = useState<MembershipState>({}),
    [pending, setPending] = useState(false),
    [copied, setCopied] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [fieldVersion, setFieldVersion] = useState(0);
  const [requestFields] = useState(() =>
    Object.fromEntries(
      Object.entries(fields).filter(([name]) =>
        [
          "ride_id",
          "child_id",
          "proposal_id",
          "vehicle_id",
          "request_id",
        ].includes(name),
      ),
    ),
  );
  async function submit(values: CommandInput) {
    if (busy.current || disabled) return;
    busy.current = true;
    setPending(true);
    try {
      const result = await action({ ...fields, ...requestFields, ...values });
      if (!mounted.current) return;
      if (result) {
        const ok = !result.error;
        // Success returns the person to their task. A created thing opens; a
        // sheet closes. Either way a toast confirms, because the form is gone.
        const outcome = !ok
          ? "inline"
          : (after ??
            (creates && result.path
              ? "open"
              : sheet && !result.token
                ? "close"
                : "inline"));
        if (outcome !== "inline") {
          toast(result.message || "Saved");
          onResult?.(result);
          if (outcome === "close") sheet?.close();
          if (outcome === "open" && result.path)
            router.replace(result.path as never);
          if (outcome === "toast" && resetOnSuccess)
            setFieldVersion((version) => version + 1);
          return;
        }
        setState(result);
        if (resetOnSuccess && ok) setFieldVersion((version) => version + 1);
        onResult?.(result);
      }
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof Navigation) router.replace(error.target as never);
      else
        setState({
          error:
            "That didn’t go through. Your entries are still here, so check your connection and try again.",
        });
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  const origin =
    Platform.OS === "web"
      ? globalThis.location?.origin
      : process.env.EXPO_PUBLIC_WEB_ORIGIN ||
        Constants.expoConfig?.extra?.webOrigin;
  const link = state.token
    ? `${origin || "http://localhost:3000"}/app/invitations#kind=${state.kind}&token=${state.token}`
    : "";
  return (
    <Form
      onValues={submit}
      disabled={disabled || pending || Boolean(creates && state.path)}
      style={compact ? { marginVertical: 0, gap: 0 } : undefined}
    >
      <Fieldset>
        {resetOnSuccess ? (
          <Fragment key={fieldVersion}>{children}</Fragment>
        ) : (
          children
        )}
        <Button
          type="submit"
          busy={pending}
          className={tone ?? (secondary ? "secondary" : undefined)}
        >
          {pending ? "Saving…" : label}
        </Button>
      </Fieldset>
      <OutcomeFocus state={state} focusTarget={focusTarget}>
        {!pending && state.error && (
          <Paragraph role="alert">{state.error}</Paragraph>
        )}
        {!pending && state.message && (
          <Paragraph role="status">
            {renderMessage ? renderMessage(state.message) : state.message}
          </Paragraph>
        )}
        {!pending && state.path && !state.error && (
          <Link className="button primary" href={state.path}>
            Open it
          </Link>
        )}
        {/* `link` is "" without an invitation; never render a bare string in a View. */}
        {link ? (
          <Box style={{ gap: 12 }}>
            <Label>
              Invitation link
              <Field readOnly value={link} />
            </Label>
            <Button
              className="primary"
              onPress={async () => {
                try {
                  await Clipboard.setStringAsync(link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy invitation link"}
            </Button>
            <Paragraph>
              Send this link yourself. Only the email you invited can use it,
              and it is shown once.
            </Paragraph>
          </Box>
        ) : null}
      </OutcomeFocus>
    </Form>
  );
}
export { Fields };
