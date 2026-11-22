import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import * as UI from "@/ui/elements";
import Link from "@/ui/link";
import { createClient } from "@/lib/supabase/client";
import { rideTimeShort } from "@/lib/rides";
import { useSession } from "@/services/session";
import { colors, spacing, styles } from "@/ui/styles";
import { Icon } from "./presentation";

const windowInDays = 3;
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

// What each kind of change says, and whether it leaves the ride without a
// driver (the one change here that someone may want to act on).
function words(kind: string, who: string) {
  switch (kind) {
    case "driver_set":
      return { text: `${firstName(who)} is driving`, icon: "check" as const };
    case "driver_changed":
      return {
        text: `${firstName(who)} took over driving`,
        icon: "swap" as const,
      };
    case "car_changed":
      return { text: `${firstName(who)} switched cars`, icon: "car-side" as const };
    case "driver_left":
      return {
        text: `${firstName(who)} can’t drive anymore`,
        icon: "warning" as const,
        open: true,
      };
    case "family_joined":
      return { text: `${who} joined`, icon: "users" as const };
    default:
      return { text: `${who} left the ride`, icon: "users" as const };
  }
}

async function loadUpdates() {
  const { data, error } = await createClient().rpc("ride_updates", {
    p_since: new Date(Date.now() - windowInDays * 86400_000).toISOString(),
    p_limit: 20,
  });
  // News is a courtesy: never let it take the page down.
  if (error) return [];
  // One line per ride about its driver (the latest), plus family changes.
  const seen = new Set<string>();
  return data
    .filter((item) => {
      if (!item.kind.startsWith("driver_")) return true;
      if (seen.has(item.ride_id)) return false;
      seen.add(item.ride_id);
      return true;
    })
    .slice(0, 5);
}

// Pool tells the families on a ride what changed instead of asking each one
// to approve it. This is where they are told: who is driving now, who dropped
// out, who joined. Each line opens its ride. Empty means nothing to show.
export function RideUpdates() {
  const { user } = useSession();
  const updates = useQuery({
    queryKey: ["account", user?.id, "ride-updates"],
    queryFn: loadUpdates,
    enabled: Boolean(user),
  });
  if (!updates.data?.length) return null;
  return (
    <UI.Box
      role="region"
      aria-label="What changed"
      style={{ marginTop: spacing.md }}
    >
      <UI.Box className="section-head">
        <UI.Box>
          <UI.Heading2 style={{ marginBottom: 0 }}>What changed</UI.Heading2>
          <UI.Small className="section-caption">{`Last ${windowInDays} days`}</UI.Small>
        </UI.Box>
      </UI.Box>
      <UI.Section className="panel" style={{ marginTop: 0 }}>
        <UI.List className="link-list" style={{ marginVertical: 0 }}>
          {updates.data.map((item) => {
            const change = words(item.kind, item.who);
            const ride = `${rideTimeShort(item.starts_at, item.timezone)} · ${item.pickup_summary} → ${item.destination_summary}`;
            return (
              <UI.ListItem key={`${item.ride_id}-${item.kind}-${item.occurred_at}`}>
                <Link
                  href={`/app/rides/${item.ride_id}`}
                  aria-label={`${change.text}. ${ride}`}
                  style={{ alignSelf: "stretch" }}
                >
                  <UI.Box className={change.open ? "task-icon" : "team-icon"}>
                    <Icon
                      name={change.icon}
                      color={change.open ? colors.sunInk : colors.ink}
                    />
                  </UI.Box>
                  <View style={{ flex: 1 }}>
                    <UI.Strong>{change.text}</UI.Strong>
                    <UI.Small style={[styles.small, { color: colors.muted }]}>
                      {ride}
                    </UI.Small>
                  </View>
                  <Icon name="chevron-right" size={18} color={colors.muted} />
                </Link>
              </UI.ListItem>
            );
          })}
        </UI.List>
      </UI.Section>
    </UI.Box>
  );
}
