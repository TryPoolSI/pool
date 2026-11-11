const hour = 60 * 60 * 1000;

export function upcomingRideStart() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 7);
  return date.setUTCHours(14, 0, 0, 0);
}

export function hoursFrom(start, hours) {
  return new Date(start + hours * hour).toISOString();
}

// These datetime-local values are entered with UTC selected in the ride form.
export function upcomingRideFields() {
  const start = upcomingRideStart();
  const pickup = hoursFrom(start, 0).slice(0, 16);
  const dropoff = hoursFrom(start, 1).slice(0, 16);
  return { date: pickup.slice(0, 10), pickup, dropoff };
}
