/**
 * @param {Date|string} a
 * @param {Date|string} b
 */
function minutesBetween(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
}

/**
 * @param {Array<{ id: number, checkIn: Date, checkOut: Date | null }>} segments
 * @param {Date} [now]
 */
function buildTodaySummary(segments, now = new Date()) {
  const ordered = [...segments].sort(
    (a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime()
  );

  let activeMinutes = 0;
  let breakMinutes = 0;

  const mapped = ordered.map((seg, i) => {
    const checkIn = seg.checkIn;
    const checkOut = seg.checkOut;
    let durationMinutes = null;
    if (checkOut) {
      durationMinutes = minutesBetween(checkIn, checkOut);
      activeMinutes += durationMinutes;
    } else {
      durationMinutes = minutesBetween(checkIn, now);
      activeMinutes += durationMinutes;
    }

    let gapBeforeNextMinutes = null;
    if (checkOut && i < ordered.length - 1) {
      const nextIn = ordered[i + 1].checkIn;
      gapBeforeNextMinutes = minutesBetween(checkOut, nextIn);
      breakMinutes += gapBeforeNextMinutes;
    }

    return {
      id: seg.id,
      checkIn,
      checkOut,
      durationMinutes: checkOut ? durationMinutes : null,
      gapBeforeNextMinutes,
    };
  });

  const open = ordered.find((s) => !s.checkOut) || null;
  const openSegment = open ? { id: open.id, checkIn: open.checkIn } : null;

  return {
    segments: mapped,
    activeMinutes,
    breakMinutes,
    openSegment,
  };
}

module.exports = { buildTodaySummary, minutesBetween };
