/**
 * Calendar date for attendance rows (Asia/Kolkata), stored as UTC midnight of that Y-M-D
 * so Prisma @db.Date maps to the correct local workday.
 */
function attendanceCalendarDate() {
  const ymd = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return new Date(`${ymd}T00:00:00.000Z`);
}

module.exports = { attendanceCalendarDate };
