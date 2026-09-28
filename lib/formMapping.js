// Maps a row from the Google Form response sheet (as CSV headers) into our
// pending-event shape. Header matching is case-insensitive and tolerant of
// minor wording differences, so the form doesn't have to match byte-for-byte.
// See README.md "Letting club leads submit events" for the exact recommended
// question list.

function findValue(row, candidates) {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const match = keys.find((k) => k.toLowerCase().trim() === candidate.toLowerCase());
    if (match) return row[match];
  }
  // fall back to a loose "contains" match
  for (const candidate of candidates) {
    const match = keys.find((k) => k.toLowerCase().includes(candidate.toLowerCase()));
    if (match) return row[match];
  }
  return '';
}

function isYes(value) {
  return /^\s*yes\b/i.test(value || '');
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normalizeDate(value) {
  if (!value) return '';
  // Google Forms date answers usually come through as "2026-11-01" already;
  // handle "DD/MM/YYYY" and "MM/DD/YYYY"-ish sheet exports defensively.
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, a, b, year] = slash;
    const month = String(a).padStart(2, '0');
    const day = String(b).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return value;
}

function normalizeTime(value) {
  if (!value) return '';
  const match = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return '';
  let [, h, m, period] = match;
  let hour = parseInt(h, 10);
  if (period) {
    if (/PM/i.test(period) && hour !== 12) hour += 12;
    if (/AM/i.test(period) && hour === 12) hour = 0;
  }
  return `${String(hour).padStart(2, '0')}:${m}`;
}

function mapFormRowToPendingEvent(row) {
  const timestamp = findValue(row, ['Timestamp']);
  const clubName = findValue(row, ['Club Name', 'Club']);
  const title = findValue(row, ['Event Title', 'Title']);
  const description = findValue(row, ['Description', 'Event Description']);
  const date = normalizeDate(findValue(row, ['Event Date', 'Date']));
  const dateConfirmedRaw = findValue(row, ['Is the date confirmed?', 'Date Confirmed']);
  const startTime = normalizeTime(findValue(row, ['Start Time']));
  const endTime = normalizeTime(findValue(row, ['End Time']));
  const location = findValue(row, ['Location', 'Venue']);
  const category = findValue(row, ['Category']) || 'Technical';
  const interCollegeRaw = findValue(row, [
    'Is this event organized by a club from another college?',
    'Inter-College',
    'Other College'
  ]);
  const hostCollege = findValue(row, ['Host College Name (if inter-college)', 'Host College']);
  const submittedBy = findValue(row, ['Your Name', 'Submitted By']);
  const submittedByEmail = findValue(row, ['Your Email', 'Email Address', 'Email']);

  return {
    id: `pending-${slugify(timestamp || `${clubName}-${title}-${Date.now()}`)}`,
    sourceId: timestamp || `${clubName}|${title}|${date}`,
    clubName: clubName || '',
    title: title || '(untitled event)',
    description: description || '',
    date: date || '',
    dateConfirmed: dateConfirmedRaw ? isYes(dateConfirmedRaw) : true,
    startTime,
    endTime,
    location: location || '',
    category: category || 'Technical',
    scope: isYes(interCollegeRaw) ? 'inter-college' : 'campus',
    hostCollege: hostCollege || '',
    submittedBy: submittedBy || '',
    submittedByEmail: submittedByEmail || '',
    receivedAt: new Date().toISOString()
  };
}

module.exports = { mapFormRowToPendingEvent, slugify };
