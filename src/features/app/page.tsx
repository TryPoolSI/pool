import { Redirect } from "expo-router";
import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import Link from "@/ui/link";
import { familyPath, useActiveFamily } from "@/services/active-family";
import { FamilyMembershipStatus } from "./family-membership-status";
import { PageHeading, EmptyState, Icon } from "./presentation";
import { colors } from "@/ui/styles";
import { createClient } from "@/lib/supabase/client";
import { HomeDriverCoverage } from "./home-driver-coverage";
import { RideUpdates } from "./ride-updates";

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
      <PageHeading title="Home">{family?.name}</PageHeading>
      {circles.length > 0 && <HomeDriverCoverage circles={circles} />}
      {circles.length > 0 && <RideUpdates />}
      <UI.Section className="panel">
        <UI.Heading2>Your circles</UI.Heading2>
        {circles.length ? (
          <UI.List className="link-list" style={{ marginVertical: 0 }}>
            {circles.map((circle) => (
              <UI.ListItem key={circle.id}>
                <Link
                  href={`/app/circles/${circle.id}`}
                  style={{ alignSelf: "stretch" }}
                >
                  <UI.Box className="team-icon">
                    <Icon name="users" />
                  </UI.Box>
                  <UI.Strong style={{ flex: 1 }}>{circle.name}</UI.Strong>
                  <Icon name="chevron-right" size={18} color={colors.muted} />
                </Link>
              </UI.ListItem>
            ))}
          </UI.List>
        ) : (
          <EmptyState
            icon="users"
            title="Start a circle"
            href={family ? familyPath(family.id) : "/app/profile"}
            action="Create a circle"
          >
            A circle is the group of families you share rides with: a team, a
            class, a street.
          </EmptyState>
        )}
        <Link className="text-link" href="/app/invitations">
          Have an invitation link?
          <Icon name="arrow-right" size={16} color={colors.blue} />
        </Link>
      </UI.Section>
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
