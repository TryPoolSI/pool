import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import { PageHeading } from "../presentation";
import Link from "@/ui/link";
import { createClient } from "@/lib/supabase/client";
import { rideTime } from "@/lib/rides";
import { driverPageCursor, driverNextPage } from "@/lib/drivers";
import { DriverPanel } from "../driver-panel";
async function loadDriving({
  searchParams,
}: {
  searchParams: Promise<{
    after_start?: string;
    after_id?: string;
    pending?: string;
  }>;
}) {
  const client = await createClient();
  const query = await searchParams;
  const pendingOnly = query.pending === "1";
  let cursor: ReturnType<typeof driverPageCursor>;
  try {
    cursor = driverPageCursor(query);
  } catch {
    return {
      early: (
        <>
          <UI.Heading1>Your driving</UI.Heading1>
          <UI.Paragraph role="alert">
            Invalid driving page. Open the first page and try again.
          </UI.Paragraph>
          <Link href="/app/driving">First page</Link>
        </>
      ),
    };
  }
  const result = await client.rpc("driver_inbox", {
    ...cursor,
    p_pending_only: pendingOnly,
    p_limit: 26,
  });
  if (result.error) throw new Error("Driver requests could not be loaded");
  const own = result.data.slice(0, 25);
  return { model: { query, pendingOnly, result, own } };
}

const Driving = createScreen(
  loadDriving,
  ({ query, pendingOnly, result, own }) => (
    <>
      <PageHeading
        title="Your driving"
        action={
          <Link className="button secondary" href="/app/vehicles">
            Your vehicles
          </Link>
        }
      />
      <UI.Nav aria-label="Driving filters">
        <Link
          href="/app/driving"
          aria-current={!pendingOnly ? "page" : undefined}
        >
          All driving history
        </Link>
        <Link
          href="/app/driving?pending=1"
          aria-current={pendingOnly ? "page" : undefined}
        >
          Pending driver requests
        </Link>
      </UI.Nav>
      {own.length ? (
        own.map((p) => (
          <UI.Article key={p.proposal_id}>
            <UI.Heading2>
              {p.pickup_summary} → {p.destination_summary}
            </UI.Heading2>
            <UI.Paragraph>
              Pickup: {rideTime(p.starts_at, p.timezone)}
              <UI.Break />
              Drop-off: {rideTime(p.ends_at, p.timezone)}
            </UI.Paragraph>
            <DriverPanel status={p} />
          </UI.Article>
        ))
      ) : (
        <UI.Paragraph>No driver proposals on this page.</UI.Paragraph>
      )}
      <UI.Nav aria-label="Driving pages">
        {query.after_id && (
          <Link href={pendingOnly ? "/app/driving?pending=1" : "/app/driving"}>
            First page
          </Link>
        )}
        {result.data.length > 25 && (
          <Link href={driverNextPage(own[own.length - 1], pendingOnly)}>
            Next driving page
          </Link>
        )}
      </UI.Nav>
    </>
  ),
);
export default Driving;
