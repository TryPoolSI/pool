import { useState } from "react";
import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import Link from "@/ui/link";
import type { MembershipState } from "@/lib/membership";
import {
  PageHeading,
  EmptyState,
  Avatar,
  Icon,
} from "./presentation";
import { createClient } from "@/lib/supabase/client";
import { MembershipForm, NameField } from "./membership-form";
import { HomeDriverCoverage } from "./home-driver-coverage";
import { OutcomeFocus } from "./outcome-focus";

async function loadCircles(client: ReturnType<typeof createClient>) {
  const pageSize = 1000;
  const circles: { id: string; name: string }[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("circles")
      .select("id,name")
      .order("name")
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error("Membership could not be loaded");
    circles.push(...data);
    if (data.length < pageSize) return circles;
  }
}

async function loadApplication() {
  const client = createClient();
  const [families, circles] = await Promise.all([
    client.from("families").select("id,name").order("name"),
    loadCircles(client),
  ]);
  if (families.error) throw new Error("Membership could not be loaded");
  return { model: { families, circles } };
}

function HomeFamilyPanel({
  families,
}: {
  families: { id: string; name: string }[];
}) {
  const [createdMembership, setCreatedMembership] = useState<MembershipState>();
  const createdFamily = families.find(
    (family) => `/app/families/${family.id}` === createdMembership?.path,
  );
  return (
    <UI.Section className="panel">
      <UI.Heading2>Your families</UI.Heading2>
      {families.length > 0 && (
        <UI.List className="link-list">
          {families.map((family) => (
            <UI.ListItem key={family.id}>
              <Link href={`/app/families/${family.id}`}>
                <Avatar name={family.name} />
                {family.name}
                <UI.Inline aria-hidden="true">›</UI.Inline>
              </Link>
            </UI.ListItem>
          ))}
        </UI.List>
      )}
      {families.length === 0 && (
        <>
          <EmptyState title="Start with your family">
            Create a family or accept an invitation.
          </EmptyState>
          <MembershipForm
            command="create-family"
            label="Create family"
            creates
            onResult={(result) => {
              if (!result.error && result.path) setCreatedMembership(result);
            }}
          >
            <NameField />
            <NameField label="Your display name" name="display_name" />
          </MembershipForm>
        </>
      )}
      {createdFamily && createdMembership?.path && (
        <OutcomeFocus state={createdMembership}>
          <UI.Paragraph role="status">{createdMembership.message}</UI.Paragraph>
          <Link href={createdMembership.path}>Open saved membership</Link>
        </OutcomeFocus>
      )}
    </UI.Section>
  );
}

const Application = createScreen(loadApplication, ({ families, circles }) => (
  <>
    <PageHeading
      eyebrow="SHARE THE DRIVING"
      title={families.data.length ? "Home" : "Welcome to Pool"}
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
      <HomeFamilyPanel families={families.data} />
      <UI.Section className="panel">
        <UI.Heading2>Your circles</UI.Heading2>
        {circles.length ? (
          <UI.List className="link-list">
            {circles.map((circle) => (
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
    {circles.length > 0 && <HomeDriverCoverage circles={circles} />}
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
