/** "Good morning" / "Good afternoon" / "Good evening" by the hour in `timezone`. */
export function greetingFor(now: Date, timezone: string): string {
  let hour: number;
  try {
    const part = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: timezone,
    })
      .formatToParts(now)
      .find((p) => p.type === "hour");
    hour = Number(part?.value ?? now.getUTCHours());
  } catch {
    hour = now.getUTCHours();
  }
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
