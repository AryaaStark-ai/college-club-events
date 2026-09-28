// Minimal RFC 5545 (iCalendar) generator — enough for a read-only public
// feed of events. No external dependency needed for something this small.

function foldLine(line) {
  // RFC 5545: lines over 75 *octets* must be folded with CRLF + a space.
  // Measured in bytes, not characters — an em dash or emoji is several
  // bytes in UTF-8 but one JS string character, so byte length is what
  // actually matters here. Never split inside a multi-byte character.
  if (Buffer.byteLength(line, 'utf-8') <= 75) return line;

  const parts = [];
  let chunk = '';
  let chunkBytes = 0;
  // Continuation lines get a leading space when joined below, which counts
  // toward their own 75-octet budget — so they get one fewer byte to work with.
  let budget = 75;
  for (const char of line) {
    const charBytes = Buffer.byteLength(char, 'utf-8');
    if (chunkBytes + charBytes > budget) {
      parts.push(chunk);
      chunk = '';
      chunkBytes = 0;
      budget = 74;
    }
    chunk += char;
    chunkBytes += charBytes;
  }
  if (chunk) parts.push(chunk);
  return parts.join('\r\n ');
}

function escapeText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function dateStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

// Asia/Kolkata has no DST, so a single fixed +05:30 offset is all VTIMEZONE needs.
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Asia/Kolkata',
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:+0530',
  'TZOFFSETTO:+0530',
  'TZNAME:IST',
  'END:STANDARD',
  'END:VTIMEZONE'
].join('\r\n');

function localDateTimeStamp(dateStr, timeStr) {
  return `${dateStr.replace(/-/g, '')}T${timeStr.replace(':', '')}00`;
}

// Pure calendar-date math via Date.UTC, deliberately avoiding the server's
// local timezone — mixing local Date methods with toISOString() (UTC) rolls
// the date back a day for any timezone ahead of UTC (like IST, UTC+5:30).
function addOneDayStamp(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 1);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function eventToVEvent(event, club, hostUrl) {
  const uid = `${event.id}@college-club-hub`;
  const organizer = event.scope === 'inter-college' ? (event.hostCollege || 'Partner college') : (club ? club.name : '');
  const summaryBits = [event.title];
  if (event.dateConfirmed === false) summaryBits.push('(tentative)');
  const descriptionBits = [event.description || '', organizer ? `Organized by: ${organizer}` : '']
    .filter(Boolean)
    .join('\n\n');

  const lines = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${dateStamp(new Date(event.receivedAt || Date.now()))}`];

  if (event.startTime) {
    const start = localDateTimeStamp(event.date, event.startTime);
    const end = event.endTime && event.endTime !== event.startTime
      ? localDateTimeStamp(event.date, event.endTime)
      : localDateTimeStamp(event.date, event.startTime);
    lines.push(`DTSTART;TZID=Asia/Kolkata:${start}`);
    lines.push(`DTEND;TZID=Asia/Kolkata:${end}`);
  } else {
    const day = event.date.replace(/-/g, '');
    lines.push(`DTSTART;VALUE=DATE:${day}`);
    lines.push(`DTEND;VALUE=DATE:${addOneDayStamp(event.date)}`);
  }

  lines.push(`SUMMARY:${escapeText(summaryBits.join(' '))}`);
  if (descriptionBits) lines.push(`DESCRIPTION:${escapeText(descriptionBits)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.category) lines.push(`CATEGORIES:${escapeText(event.category)}`);
  if (hostUrl) lines.push(`URL:${hostUrl}`);
  lines.push('END:VEVENT');

  return lines.map(foldLine).join('\r\n');
}

function buildCalendar(events, clubById, options) {
  const { calendarName, hostOrigin } = options || {};
  const vevents = events.map((e) => eventToVEvent(e, clubById[e.clubId], hostOrigin && e.clubId ? `${hostOrigin}/club.html?id=${e.clubId}` : ''));

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//College Club Hub//Events Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName || 'College Club Hub')}`,
    'X-WR-TIMEZONE:Asia/Kolkata',
    VTIMEZONE,
    ...vevents,
    'END:VCALENDAR'
  ];

  return lines.join('\r\n') + '\r\n';
}

module.exports = { buildCalendar };
