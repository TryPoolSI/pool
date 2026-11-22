import { Pressable, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import Link from "@/ui/link";
import { PageHeading, EmptyState, Icon } from "../presentation";
import { colors, compactHeight, radius, spacing, styles } from "@/ui/styles";
import { tap } from "@/ui/haptics";
import { createClient } from "@/lib/supabase/client";
import {
  addDays,
  dateInZone,
  daysRange,
  deviceTimezone,
  localDate,
  type RideOffer,
} from "@/lib/rides";
import type { DriverStatus } from "@/lib/drivers";
import { rideSummary } from "@/lib/ride-state";
import { RideList } from "../ride-list";

const utc = { timeZone: "UTC" } as const;
const monthDay = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", ...utc });
const longDay = new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric", ...utc });
const weekday = new Intl.DateTimeFormat("en", { weekday: "long", ...utc });
const at = (date: string) => new Date(`${date}T12:00:00Z`);

function validDate(value?: string) {
  if (typeof value !== "string") return undefined;
  try {
    localDate(value);
    return value;
  } catch {
    return undefined;
  }
}

async function loadSchedule({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; date?: string }>;
}) {
  const query = await searchParams;
  // The Schedule runs on the device's clock and opens on the seven days from
  // today, because past days are rarely what anyone came for.
  const zone = deviceTimezone();
  const today = dateInZone(new Date(), zone);
  const asked = validDate(query.date);
  let first = validDate(query.from) ?? today;
  // A link to a day outside the strip starts the strip on that day.
  if (asked && (asked < first || asked > addDays(first, 6))) first = asked;
  const range = daysRange(first, 7, zone);
  const client = await createClient();
  const offers = await client.rpc("ride_offers", {
    p_from: range.from,
    p_until: range.until,
  });
  if (offers.error) throw new Error("Pool couldn’t load this week. Try again.");
  const statuses = await client.rpc("driver_statuses", {
    p_ride_ids: [...new Set(offers.data.map((ride) => ride.id))],
  });
  if (statuses.error)
    throw new Error("Pool couldn’t load this week. Try again.");
  return {
    model: { first, zone, offers: offers.data, statuses: statuses.data },
  };
}

function Week({
  first,
  zone,
  offers,
  statuses,
}: {
  first: string;
  zone: string;
  offers: RideOffer[];
  statuses: DriverStatus[];
}) {
  const params = useLocalSearchParams<{ date?: string }>();
  const { width } = useWindowDimensions();
  // Seven 44px days and their gaps need 332px. On a narrower phone the strip
  // runs to the screen edges (the shell's 16px inset) with hairline gaps, so
  // every day stays a full-size target on one row.
  const tight = width < 332 + 2 * spacing.lg;
  const today = dateInZone(new Date(), zone);
  const days = Array.from({ length: 7 }, (_, index) => addDays(first, index));
  // The day comes straight from the URL so a tap responds before data returns.
  const asked = validDate(params.date);
  const selected =
    asked && days.includes(asked)
      ? asked
      : days.includes(today)
        ? today
        : first;
  const dayOf = (ride: RideOffer) => dateInZone(new Date(ride.starts_at), zone);
  // One mark per day: sun if any ride there still needs someone, else sky.
  const marks = new Map<string, "attention" | "settled">();
  for (const ride of offers) {
    if (ride.cancelled_at || ride.status === "declined") continue;
    const tone = rideSummary({
      familyStatus: ride.status,
      status: statuses.find((item) => item.ride_id === ride.id),
    }).tone;
    const day = dayOf(ride);
    if (tone === "act" || tone === "open" || tone === "waiting")
      marks.set(day, "attention");
    else if (!marks.has(day)) marks.set(day, "settled");
  }
  const dayRides = offers.filter((ride) => dayOf(ride) === selected);
  const count = new Set(dayRides.map((ride) => ride.id)).size;
  // A strip opened from a link to some other week stays on that week while the
  // person picks days in it, so the week it starts on goes into the URL too.
  const select = (date: string) =>
    router.setParams(first === today ? { date } : { from: first, date });
  const move = (start: string) => router.setParams({ from: start, date: start });
  const planHref = `/app/rides/new?date=${selected}`;
  return (
    <>
      <View
        role="navigation"
        accessibilityLabel="Weeks"
        style={[styles.row, { marginBottom: spacing.md }]}
      >
        <UI.Heading2 style={{ flex: 1, marginBottom: 0 }}>
          {monthDay.format(at(first))} – {monthDay.format(at(days[6]))}
        </UI.Heading2>
        {first !== today && (
          <UI.Button
            className="quiet"
            onPress={() => router.replace("/app/schedule")}
          >
            Today
          </UI.Button>
        )}
        {(
          [
            ["Previous week", "chevron-left", addDays(first, -7)],
            ["Next week", "chevron-right", addDays(first, 7)],
          ] as const
        ).map(([label, icon, date]) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => move(date)}
            style={({ pressed }) => [
              styles.button,
              styles.iconButton,
              { alignSelf: "center" },
              pressed ? styles.pressed : undefined,
            ]}
          >
            <Icon name={icon} size={20} />
          </Pressable>
        ))}
      </View>
      <View
        role="tablist"
        accessibilityLabel="Days this week"
        style={{
          flexDirection: "row",
          gap: tight ? 2 : spacing.xs,
          marginHorizontal: tight ? -spacing.lg : 0,
        }}
      >
        {days.map((date) => {
          const isSelected = date === selected;
          const isToday = date === today;
          const mark = marks.get(date);
          const name = longDay.format(at(date));
          return (
            <Pressable
              key={date}
              role="tab"
              aria-selected={isSelected}
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${name}${isToday ? ", today" : ""}${
                mark === "attention"
                  ? ", needs attention"
                  : mark
                    ? ", rides covered"
                    : ", no rides"
              }`}
              onPress={() => {
                if (isSelected) return;
                tap();
                select(date);
              }}
              style={({ pressed }) => [
                {
                  flex: 1,
                  minHeight: 68,
                  paddingVertical: spacing.sm,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  borderRadius: radius.md,
                  borderWidth: 1.5,
                  borderColor: isSelected
                    ? colors.sky
                    : isToday
                      ? colors.blue
                      : "transparent",
                  backgroundColor: isSelected ? colors.sky : colors.surface,
                },
                pressed ? styles.pressed : undefined,
              ]}
            >
              <UI.Inline
                style={{
                  fontSize: 12,
                  lineHeight: 16,
                  fontWeight: "600",
                  color: isSelected ? colors.ink : colors.muted,
                }}
              >
                {name.slice(0, 3)}
              </UI.Inline>
              <UI.Strong style={{ fontSize: 18, lineHeight: 24 }}>
                {Number(date.slice(-2))}
              </UI.Strong>
              <View
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: radius.full,
                  backgroundColor: !mark
                    ? "transparent"
                    : mark === "attention"
                      ? isSelected
                        ? colors.sunInk
                        : colors.sun
                      : isSelected
                        ? colors.blue
                        : colors.sky,
                }}
              />
            </Pressable>
          );
        })}
      </View>
      <View
        role="tabpanel"
        accessibilityLabel={longDay.format(at(selected))}
        style={{ marginTop: spacing.xl }}
      >
        <View style={[styles.row, { minHeight: compactHeight }]}>
          <UI.Box style={{ flex: 1 }}>
            <UI.Heading2 style={{ marginBottom: 0 }}>
              {selected === today ? "Today" : longDay.format(at(selected))}
            </UI.Heading2>
            {count > 0 && (
              <UI.Small style={{ color: colors.muted }}>
                {count} {count === 1 ? "ride" : "rides"}
              </UI.Small>
            )}
          </UI.Box>
          {count > 0 && selected >= today && (
            <Link className="button secondary" href={planHref}>
              <Icon name="plus" size={16} />
              Plan a ride
            </Link>
          )}
        </View>
        {count ? (
          <RideList offers={dayRides} statuses={statuses} showDate={false} />
        ) : (
          <UI.Section className="panel">
            <EmptyState
              icon="calendar"
              title={`Nothing on ${selected === today ? "today" : weekday.format(at(selected))}`}
              href={selected >= today ? planHref : undefined}
              action="Plan a ride"
            >
              {selected >= today
                ? "Plan a ride for this day, or pick another day above."
                : "No rides happened on this day."}
            </EmptyState>
          </UI.Section>
        )}
      </View>
    </>
  );
}

const Schedule = createScreen(
  loadSchedule,
  (model) => (
    <>
      <PageHeading title="Schedule" />
      <Week {...model} />
    </>
  ),
  { retain: true },
);
export default Schedule;
