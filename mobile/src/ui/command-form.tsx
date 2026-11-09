import { useRef, useState, type ReactNode } from "react";
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
import type { MembershipState } from "@/lib/membership";
export function CommandForm({
  action,
  fields = {},
  label,
  children,
  creates = false,
  resultLabel = "Open saved result",
  onResult,
  focusTarget,
}: {
  action: (fields: CommandInput) => Promise<MembershipState | void>;
  fields?: CommandInput;
  label: string;
  children?: ReactNode;
  creates?: boolean;
  resultLabel?: string;
  focusTarget?: string;
  onResult?: (result: MembershipState) => void;
}) {
  const [state, setState] = useState<MembershipState>({}),
    [pending, setPending] = useState(false),
    [copied, setCopied] = useState(false);
  const busy = useRef(false);
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
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const result = await action({ ...fields, ...requestFields, ...values });
      if (result) {
        setState(result);
        onResult?.(result);
      }
    } catch (error) {
      if (error instanceof Navigation) router.replace(error.target as never);
      else
        setState({
          error:
            "We could not save this change. It may have reached the server; refresh before retrying.",
        });
    } finally {
      busy.current = false;
      setPending(false);
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
      disabled={pending || Boolean(creates && state.path)}
    >
      <Fieldset>
        {children}
        <Button type="submit">{pending ? "Saving…" : label}</Button>
      </Fieldset>
      <OutcomeFocus state={state} focusTarget={focusTarget}>
        {pending && <Paragraph role="status">Saving your change…</Paragraph>}
        {!pending && state.error && (
          <Paragraph role="alert">{state.error}</Paragraph>
        )}
        {!pending && state.message && (
          <Paragraph role="status">{state.message}</Paragraph>
        )}
        {!pending && state.path && <Link href={state.path}>{resultLabel}</Link>}
        {link && (
          <Box>
            <Label>
              Manual invitation link
              <Field readOnly value={link} />
            </Label>
            <Button
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
              Only the invited email can accept. Keep this link private. It is
              shown once; create a replacement if lost.
            </Paragraph>
          </Box>
        )}
      </OutcomeFocus>
    </Form>
  );
}
export { Fields };
