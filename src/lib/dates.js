/**
 * Date helpers used across the API.
 *
 * Calendar date for attendance / leave rows is stored as UTC midnight of the
 * Y-M-D in the org's timezone (defaulting to Asia/Kolkata) so Prisma's
 * `@db.Date` maps to the right local workday.
 */
function startOfDayInTz(date = new Date(), tz = 'Asia/Kolkata') {
  const ymd = new Date(date).toLocaleDateString('en-CA', { timeZone: tz });
  return new Date(`${ymd}T00:00:00.000Z`);
}

function attendanceCalendarDate(tz = 'Asia/Kolkata') {
  return startOfDayInTz(new Date(), tz);
}

/** Inclusive count of calendar days between two ISO date strings. */
function diffDaysInclusive(start, end) {
  const s = startOfDayInTz(start);
  const e = startOfDayInTz(end);
  const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
  return Math.max(0, days);
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function formatYmd(date) {
  if (!date) return '';
  return new Date(date).toISOString().slice(0, 10);
}

module.exports = {
  startOfDayInTz,
  attendanceCalendarDate,
  diffDaysInclusive,
  addMonths,
  formatYmd,
};
