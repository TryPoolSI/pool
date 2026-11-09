import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import Link from "@/ui/link";
import {
  PageHeading,
  EmptyState,
  ActionDialog,
  Avatar,
  Icon,
} from "./presentation";
import { createClient } from "@/lib/supabase/client";
import { MembershipForm, NameField } from "./membership-form";

async function loadApplication() {
  const client = await createClient();
  const [families, circles] = await Promise.all([
    client.from("families").select("id,name").order("name"),
    client.from("circles").select("id,name").order("name"),
  ]);
  if (families.error || circles.error)
    throw new Error("Membership could not be loaded");
  return { model: { families, circles } };
}

const Application = createScreen(loadApplication, ({ families, circles }) => (
  <>
    <PageHeading
      eyebrow="SHARE THE DRIVING"
      title={
        families.data.length ? "Your family, your circle." : "Welcome to Pool"
      }
      action={
        <Link className="button secondary" href="/app/attention">
          Today’s rides →
        </Link>
      }
    >
      {!families.data.length &&
        "Start with your family, then bring your circle together."}
    </PageHeading>
    <UI.Box className="dashboard-grid">
      <UI.Section className="panel">
        <UI.Heading2>Your families</UI.Heading2>
        {families.data.length ? (
          <UI.List className="link-list">
            {families.data.map((family) => (
              <UI.ListItem key={family.id}>
                <Link href={`/app/families/${family.id}`}>
                  <Avatar name={family.name} />
                  {family.name}
                  <UI.Inline aria-hidden="true">›</UI.Inline>
                </Link>
              </UI.ListItem>
            ))}
          </UI.List>
        ) : (
          <EmptyState title="Start with your family">
            Create a family or accept an invitation.
          </EmptyState>
        )}
        <ActionDialog title="Create a family" inline={!families.data.length}>
          <MembershipForm command="create-family" label="Create family">
            <NameField />
            <NameField label="Your display name" name="display_name" />
          </MembershipForm>
        </ActionDialog>
      </UI.Section>
      <UI.Section className="panel">
        <UI.Heading2>Your circles</UI.Heading2>
        {circles.data.length ? (
          <UI.List className="link-list">
            {circles.data.map((circle) => (
              <UI.ListItem key={circle.id}>
                <Link href={`/app/circles/${circle.id}`}>
                  <UI.Inline className="team-icon">
                    <Icon name="shield" />
                  </UI.Inline>
                  {circle.name}
                  <UI.Inline aria-hidden="true">›</UI.Inline>
                </Link>
              </UI.ListItem>
            ))}
          </UI.List>
        ) : (
          <EmptyState title="Share the driving">
            Create a circle from your family, or join one by invitation.
          </EmptyState>
        )}
        <Link className="text-link" href="/app/invitations">
          Accept an invitation <UI.Inline aria-hidden="true">↗</UI.Inline>
        </Link>
      </UI.Section>
    </UI.Box>
    {Boolean(families.data.length) && (
      <UI.Box className="setup-cards">
        <Link href="/app/children">
          <Icon name="users" />
          <UI.Strong>Your children</UI.Strong>
          <UI.Inline>Riders and seat requirements →</UI.Inline>
        </Link>
        <Link href="/app/vehicles">
          <Icon name="car" />
          <UI.Strong>Your vehicles</UI.Strong>
          <UI.Inline>Registered passenger capacity →</UI.Inline>
        </Link>
      </UI.Box>
    )}
  </>
));
export default Application;
