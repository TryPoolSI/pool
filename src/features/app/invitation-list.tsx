import * as UI from "@/ui/elements";
import { createPanel } from "@/ui/remote";
import { colors, spacing, styles } from "@/ui/styles";
import { ActionDialog, Disclosure, StatusBadge } from "./presentation";
import { createClient } from "@/lib/supabase/client";
import { MembershipForm } from "./membership-form";

async function loadInvitationList({
  kind,
  scopeId,
}: {
  kind: "guardian" | "circle";
  scopeId: string;
}) {
  const client = await createClient();
  const { data, error } = await client.rpc("list_invitations", {
    p_kind: kind,
    p_scope_id: scopeId,
  });
  if (error) throw new Error("Pool couldn’t load the invitations.");
  return { model: { data } };
}

// "Nov 28", in the reader's own timezone.
export function shortDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const row = {
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.md,
  paddingVertical: spacing.md,
  borderTopWidth: 1,
  borderTopColor: colors.line,
} as const;

// Invitations still waiting for an answer are always visible; answered,
// revoked and expired ones sit behind a disclosure.
export const InvitationList = createPanel(
  "loadInvitationList",
  loadInvitationList,
  ({ data }) => {
    const now = Date.now();
    const state = (invitation: (typeof data)[number]) =>
      invitation.consumed_at
        ? "Accepted"
        : invitation.revoked_at
          ? "Revoked"
          : Date.parse(invitation.expires_at) <= now
            ? "Expired"
            : "Pending";
    const pending = data.filter((invitation) => state(invitation) === "Pending");
    const earlier = data.filter((invitation) => state(invitation) !== "Pending");
    if (!data.length) return null;
    return (
      <UI.Box>
        {pending.length > 0 && (
          <UI.Heading3 style={{ marginBottom: spacing.sm }}>
            Waiting for a reply
          </UI.Heading3>
        )}
        {pending.length > 0 && (
          <UI.Box role="list" aria-label="Pending invitations">
            {pending.map((invitation) => (
              <UI.Box key={invitation.id} role="listitem" style={row}>
                <UI.Box style={{ flex: 1, gap: spacing.xs }}>
                  <UI.Strong>{invitation.email}</UI.Strong>
                  <UI.Box style={styles.actionRow}>
                    <StatusBadge tone="attention">Pending</StatusBadge>
                    <UI.Small style={{ color: colors.muted }}>
                      Expires {shortDate(invitation.expires_at)}
                    </UI.Small>
                  </UI.Box>
                </UI.Box>
                <ActionDialog
                  title="Revoke invitation"
                  triggerLabel="Revoke"
                  tone="danger"
                  compact
                >
                  <UI.Paragraph>
                    The link you sent to {invitation.email} will stop working.
                    You can invite them again later.
                  </UI.Paragraph>
                  <MembershipForm
                    command="revoke-invitation"
                    fields={{ invitation_id: invitation.id }}
                    label="Revoke invitation"
                    tone="danger"
                  />
                </ActionDialog>
              </UI.Box>
            ))}
          </UI.Box>
        )}
        {earlier.length > 0 && (
          <Disclosure title="Earlier invitations">
            <UI.Box role="list" aria-label="Earlier invitations">
              {earlier.map((invitation) => (
                <UI.Box
                  key={invitation.id}
                  role="listitem"
                  style={{ paddingVertical: spacing.sm, gap: spacing.xs }}
                >
                  <UI.Inline>{invitation.email}</UI.Inline>
                  <UI.Small style={{ color: colors.muted }}>
                    {state(invitation)}
                  </UI.Small>
                </UI.Box>
              ))}
            </UI.Box>
          </Disclosure>
        )}
      </UI.Box>
    );
  },
);
