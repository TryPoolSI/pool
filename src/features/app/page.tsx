import { Redirect } from "expo-router";
import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import Link from "@/ui/link";
import { familyPath, useActiveFamily } from "@/services/active-family";
import { FamilyMembershipStatus } from "./family-membership-status";
import { PageHeading, EmptyState, Avatar, Icon } from "./presentation";
import { createClient } from "@/lib/supabase/client";
import { HomeDriverCoverage } from "./home-driver-coverage";

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
  return { model: { circles: await loadCircles(createClient()) } };
}

const Home = createScreen(loadApplication, ({ circles }) => (
  <HomeContent circles={circles} />
));

function HomeContent({ circles }: { circles: { id: string; name: string }[] }) {
  const { data: family } = useActiveFamily();
  return (
    <>
      <PageHeading
        eyebrow="SHARE THE DRIVING"
        title="Home"
        action={
          <Link className="button secondary" href="/app/attention">
            Today’s rides →
          </Link>
        }
      />
      <UI.Box className="dashboard-grid">
        {family && (
          <UI.Section className="panel">
            <UI.Heading2>Your family</UI.Heading2>
            <Link href={familyPath(family.id)}>
              <Avatar name={family.name} />
              {family.name}
              <UI.Inline aria-hidden="true">›</UI.Inline>
            </Link>
          </UI.Section>
        )}
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
    </>
  );
}

export default function Application() {
  const membership = useActiveFamily();
  if (membership.isError || !membership.data) {
    if (
      membership.isSuccess &&
      membership.data === null &&
      !membership.isFetching
    )
      return <Redirect href="/app/profile" />;
    return <FamilyMembershipStatus membership={membership} />;
  }
  return <Home />;
}
