import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWindowDimensions } from "react-native";
import * as UI from "@/ui/elements";
import Link from "@/ui/link";
import { colors, spacing, styles } from "@/ui/styles";
import { AuthForm } from "@/features/auth/auth-form";
import {
  InvitationLinkField,
  invalidInvitationLink,
} from "@/features/invitations/link-field";
import { createClient } from "@/lib/supabase/client";
import { membershipAction } from "@/services/membership-actions";
import { familyPath, type ActiveFamily } from "@/services/active-family";
import { useSession } from "@/services/session";
import type { MembershipState } from "@/lib/membership";
import { shortDate } from "../invitation-list";
import { MembershipForm, NameField } from "../membership-form";
import { Icon } from "../presentation";
import {
  onInvitation,
  rememberInvitation,
  invitationParts,
} from "@/services/invitation-link";

// Cards that hold a form are no wider than the form itself.
const card = { maxWidth: styles.form.maxWidth, width: "100%" } as const;

type Parts = NonNullable<ReturnType<typeof invitationParts>>;
type Check =
  | { state: "checking" }
  | { state: "found"; preview: NonNullable<MembershipState["preview"]> }
  | { state: "failed"; error: string; issue?: MembershipState["issue"] };

export function AcceptInvitation({
  family,
  membershipReady,
}: {
  family: ActiveFamily | null | undefined;
  membershipReady: boolean;
}) {
  const [link, setLink] = useState("");
  // The typed text is only judged when the person asks, not while they type.
  const [invalid, setInvalid] = useState(false);
  const [found, setFound] = useState(false);
  useEffect(
    () =>
      onInvitation((value) => {
        setLink(value);
        setInvalid(Boolean(value) && !invitationParts(value));
      }),
    [],
  );
  const parsed = invitationParts(link);
  function pasteAgain() {
    setFound(false);
    setInvalid(false);
    setLink("");
    void rememberInvitation("").catch(() => {});
  }
  return (
    <>
      {!(parsed && found) && (
        <UI.Section style={card}>
          <InvitationLinkField
            value={link}
            hint="Paste the link you were sent. A family invitation adds you to that family; a circle invitation adds your family to that circle."
            onChange={(value) => {
              setInvalid(false);
              setFound(false);
              setLink(value);
            }}
          />
          {invalid && !parsed && (
            <UI.Paragraph role="alert">
              {link.trim()
                ? invalidInvitationLink
                : "Paste your invitation link first."}
            </UI.Paragraph>
          )}
          {!parsed && (
            <UI.Button
              className="primary"
              style={{ marginTop: spacing.lg }}
              onPress={() => setInvalid(true)}
            >
              Check invitation
            </UI.Button>
          )}
        </UI.Section>
      )}
      {parsed && (
        <InvitationDecision
          key={`${parsed.kind}-${parsed.token}`}
          link={link}
          parsed={parsed}
          family={family}
          membershipReady={membershipReady}
          onFound={() => setFound(true)}
          onPasteAgain={pasteAgain}
        />
      )}
    </>
  );
}

// A complete link is checked as soon as it arrives, whether it was opened from
// a message or pasted here.
function InvitationDecision({
  link,
  parsed,
  family,
  membershipReady,
  onFound,
  onPasteAgain,
}: {
  link: string;
  parsed: Parts;
  family: ActiveFamily | null | undefined;
  membershipReady: boolean;
  onFound: () => void;
  onPasteAgain: () => void;
}) {
  const [check, setCheck] = useState<Check>({ state: "checking" });
  const [issue, setIssue] = useState<MembershipState["issue"]>();
  const { user } = useSession();
  const { width } = useWindowDimensions();
  const { kind, token } = parsed;
  useEffect(() => {
    let current = true;
    // The signed-in user can continue checking even if persistence is unavailable.
    void rememberInvitation(link).catch(() => {});
    membershipAction({}, { command: "preview-invitation", kind, token })
      .then((result) => {
        if (!current) return;
        if (result.preview) {
          setCheck({ state: "found", preview: result.preview });
          onFound();
        } else
          setCheck({
            state: "failed",
            error: result.error ?? invalidInvitationLink,
            issue: result.issue,
          });
      })
      .catch(() => {
        if (current)
          setCheck({
            state: "failed",
            error:
              "Pool couldn’t check this invitation. Check your connection and try again.",
          });
      });
    return () => {
      current = false;
    };
    // One check per link: this component is keyed by the link's kind and token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, token]);

  // Someone who already has a name in Pool is not asked for it again.
  const profile = useQuery({
    queryKey: ["account", user?.id, "own-name"],
    enabled: Boolean(user),
    queryFn: async ({ signal }) => {
      const { data } = await createClient()
        .from("profiles")
        .select("display_name")
        .eq("id", user!.id)
        .abortSignal(signal)
        .maybeSingle();
      return data?.display_name ?? "";
    },
  });

  if (check.state === "checking")
    return <UI.Loading>Checking your invitation…</UI.Loading>;

  const stacked = width <= 650 ? ({ alignSelf: "stretch" } as const) : undefined;
  if (check.state === "failed")
    return (
      <UI.Section style={card}>
        <UI.Paragraph role="alert" style={{ marginTop: 0 }}>
          {check.error}
        </UI.Paragraph>
        {check.issue === "invite-unavailable" && (
          <UI.Paragraph>You’re signed in as {user?.email}.</UI.Paragraph>
        )}
        <UI.Button style={stacked} onPress={onPasteAgain}>
          Paste again
        </UI.Button>
        {check.issue === "invite-unavailable" && (
          <AuthForm mode="switch-account" />
        )}
      </UI.Section>
    );

  const { preview } = check;
  const circleRequiresOwner = kind === "circle" && family?.role === "guardian";
  const knownName = profile.data;
  return (
    <UI.Section style={card}>
      <UI.Box style={[styles.row, { alignItems: "flex-start" }]}>
        <UI.Box className="team-icon">
          <Icon name={kind === "guardian" ? "users" : "car"} />
        </UI.Box>
        <UI.Box style={{ flex: 1 }}>
          <UI.Heading2 style={{ marginBottom: spacing.xs }}>
            {kind === "guardian" ? "Join family" : "Join circle"}:{" "}
            {preview.name}
          </UI.Heading2>
          <UI.Small style={{ color: colors.muted }}>
            {kind === "guardian"
              ? "You’ll be a guardian: you can manage this family’s children and rides."
              : "A circle is the group of families you share rides with."}{" "}
            Expires {shortDate(preview.expires)}.
          </UI.Small>
        </UI.Box>
      </UI.Box>
      {circleRequiresOwner ? (
        <UI.Paragraph role="status" className="notice attention">
          Only a family’s owner can add it to a circle. Ask the circle’s
          organizer to invite your family’s owner instead.
        </UI.Paragraph>
      ) : (
        family !== undefined &&
        !profile.isPending && (
          <MembershipForm
            command="accept-invitation"
            fields={{
              ...parsed,
              ...(knownName ? { display_name: knownName } : {}),
              ...(kind === "circle"
                ? { family_choice: family?.id ?? "new" }
                : {}),
            }}
            label={`Join ${preview.name}`}
            disabled={!membershipReady}
            creates
            successMessage={`You joined ${preview.name}`}
            onResult={(result) => setIssue(result.issue)}
          >
            {!knownName && (
              <NameField name="display_name" label="Your name" />
            )}
            {kind === "circle" &&
              (family ? (
                <UI.Paragraph style={{ marginVertical: 0 }}>
                  {family.name} will join this circle.
                </UI.Paragraph>
              ) : (
                <>
                  <NameField placeholder="The Riveras" />
                  <UI.Small style={{ color: colors.muted }}>
                    Your family is the adults and children in your household.
                    It joins this circle.
                  </UI.Small>
                </>
              ))}
          </MembershipForm>
        )
      )}
      {(issue === "active-family" || issue === "retry-membership") &&
        family && <Link href={familyPath(family.id)}>My family</Link>}
      {issue === "invite-unavailable" && (
        <>
          <UI.Paragraph>You’re signed in as {user?.email}.</UI.Paragraph>
          <AuthForm mode="switch-account" />
        </>
      )}
      <UI.Button className="quiet" style={stacked} onPress={onPasteAgain}>
        Use a different link
      </UI.Button>
    </UI.Section>
  );
}
