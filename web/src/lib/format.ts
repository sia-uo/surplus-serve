export function fmtTime(ts: number, intl: string): string {
  return new Date(ts).toLocaleTimeString(intl, { hour: 'numeric', minute: '2-digit' });
}

export function fmtDateTime(ts: number, intl: string): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? fmtTime(ts, intl)
    : d.toLocaleString(intl, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function fmtDate(ts: number | string, intl: string): string {
  return new Date(ts).toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtNumber(n: number, intl: string): string {
  return new Intl.NumberFormat(intl, { maximumFractionDigits: 1 }).format(n);
}

/** Value for <input type="datetime-local"> in the device's local time. */
export function toLocalInput(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): number {
  return new Date(v).getTime();
}

export function relativeFromNow(ts: number, intl: string): string {
  const diff = ts - Date.now();
  const rtf = new Intl.RelativeTimeFormat(intl, { numeric: 'auto' });
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
  return rtf.format(Math.round(mins / 60), 'hour');
}

export function todayIso(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
