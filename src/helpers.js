export const MIN_BOOKING_LENGTH = 30;

export const SERVICES = {
  detailing: { label: "Auto Cleaning & Detailing", color: "#2F6690" },
};

export function serviceFor(id) {
  return SERVICES[id] || SERVICES.detailing;
}

export function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDayLabel(date) {
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function toHHMM(mins) {
  mins = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatClock(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

export function loadColor(fraction, blocked) {
  if (blocked) return { bg: "#3A3530", fg: "#E8E4DC", label: "Out of Service" };
  if (fraction === null || fraction === undefined) return { bg: "#EDEAE3", fg: "#A8A39A", label: "No availability set" };
  if (fraction >= 0.8) return { bg: "#F4DCD6", fg: "#A32D2D", label: "Nearly full" };
  if (fraction >= 0.4) return { bg: "#FBE9C9", fg: "#9C6B1F", label: "Partially booked" };
  return { bg: "#DEEDE3", fg: "#3D7A52", label: "Mostly open" };
}
