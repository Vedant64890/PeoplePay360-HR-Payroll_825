export function shiftMinutes(line) {
  const values = [line.startMinute, line.endMinute, line.endDayOffset, line.breakMinutes];
  if (!values.every(Number.isFinite)) return null;
  const duration = line.endMinute + line.endDayOffset * 1440 - line.startMinute;
  return duration > 0 && duration <= 1440 && line.breakMinutes >= 0 && line.breakMinutes < duration ? duration - line.breakMinutes : null;
}

export function weeklyHours(lines = []) {
  if (!lines.length) return null;
  const minutes = lines.map(shiftMinutes);
  if (minutes.includes(null)) return null;
  return minutes.reduce((total, value) => total + value, 0) / 60;
}

export function hoursLabel(hours) {
  return hours == null ? "Check shift times" : `${hours.toLocaleString(undefined, { maximumFractionDigits: 2 })} h`;
}
