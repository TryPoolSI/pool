import { createClient } from "@/lib/supabase/client";

type Client = Awaited<ReturnType<typeof createClient>>;

// A guardian who puts their children on a ride is also who meets them at
// drop-off, unless the family names someone else on the ride. Saved quietly
// with the reply so the driver is never blocked at pickup; it never fails the
// reply itself.
export async function meetOwnRiders(
  client: Client,
  guardian: string,
  ride: string,
  family: string,
  riders: string[],
) {
  if (!riders.length) return;
  try {
    const [offers, handoffs] = await Promise.all([
      client.rpc("ride_offer", { p_id: ride }),
      client
        .from("ride_handoffs")
        .select("child_id")
        .eq("ride_id", ride)
        .in("child_id", riders),
    ]);
    const revision = offers.data?.find(
      (offer) => offer.family_id === family,
    )?.revision;
    if (!revision || handoffs.error) return;
    const named = new Set(handoffs.data.map((handoff) => handoff.child_id));
    for (const child of riders.filter((rider) => !named.has(rider)))
      await client.rpc("designate_recipient", {
        p_ride_id: ride,
        p_child_id: child,
        p_recipient_id: guardian,
        p_revision: revision,
        p_version: 0,
      });
  } catch {
    // The family can still choose who meets each child on the ride.
  }
}
