require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const fs = require('fs/promises');
const path = require('path');
const { csvToObjects } = require('./lib/csv');
const { mapFormRowToPendingEvent } = require('./lib/formMapping');
const { buildCalendar } = require('./lib/ics');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const DEFAULT_SHEET_CSV_URL = process.env.SHEET_CSV_URL || '';

if (!process.env.SESSION_SECRET) {
  console.warn('No SESSION_SECRET set in .env — using a random one for this run. Admin sessions will not survive a server restart until you set one.');
}

const CLUBS_PATH = path.join(__dirname, 'data', 'clubs.json');
const EVENTS_PATH = path.join(__dirname, 'data', 'events.json');
const PENDING_PATH = path.join(__dirname, 'data', 'pending-events.json');
const REJECTED_IDS_PATH = path.join(__dirname, 'data', 'rejected-source-ids.json');

async function readJsonOrDefault(filePath, fallback) {
  try {
    return await readJson(filePath);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function requireAdminSession(req, res, next) {
  if (!req.session || !req.session.isAdmin) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

// Constant-time string compare so a login attempt can't be timed to guess
// the username/password character by character.
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA); // keep timing consistent either way
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

app.use(express.json());
app.set('trust proxy', 1);
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000
    }
  })
);
app.use(express.static(path.join(__dirname, 'public')));

// Very small in-memory rate limits: reset on restart and aren't shared across
// processes, which is fine at this scale — their only job is to slow down
// casual spam/brute-force, not stop a determined, distributed attacker.
const submissionTimestampsByIp = new Map();
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;
const SUBMIT_MAX_PER_WINDOW = 5;

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (submissionTimestampsByIp.get(ip) || []).filter((t) => now - t < SUBMIT_WINDOW_MS);
  timestamps.push(now);
  submissionTimestampsByIp.set(ip, timestamps);
  return timestamps.length > SUBMIT_MAX_PER_WINDOW;
}

const loginAttemptsByIp = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_PER_WINDOW = 8;

function isLoginRateLimited(ip) {
  const now = Date.now();
  const timestamps = (loginAttemptsByIp.get(ip) || []).filter((t) => now - t < LOGIN_WINDOW_MS);
  timestamps.push(now);
  loginAttemptsByIp.set(ip, timestamps);
  return timestamps.length > LOGIN_MAX_PER_WINDOW;
}

function clean(value, maxLen) {
  return String(value || '').trim().slice(0, maxLen);
}

// ---------- Public API ----------

app.get('/api/clubs', async (req, res, next) => {
  try {
    const clubs = await readJson(CLUBS_PATH);
    const { category } = req.query;
    const filtered = category
      ? clubs.filter((c) => c.category.toLowerCase() === category.toLowerCase())
      : clubs;
    res.json(filtered);
  } catch (err) {
    next(err);
  }
});

app.get('/api/clubs/:id', async (req, res, next) => {
  try {
    const clubs = await readJson(CLUBS_PATH);
    const club = clubs.find((c) => c.id === req.params.id);
    if (!club) return res.status(404).json({ error: 'Club not found' });
    res.json(club);
  } catch (err) {
    next(err);
  }
});

app.get('/api/events', async (req, res, next) => {
  try {
    const events = await readJson(EVENTS_PATH);
    const { clubId, category, month, scope } = req.query;
    let filtered = events;
    if (clubId) filtered = filtered.filter((e) => e.clubId === clubId);
    if (category) filtered = filtered.filter((e) => e.category.toLowerCase() === category.toLowerCase());
    if (month) filtered = filtered.filter((e) => e.date.startsWith(month));
    if (scope) filtered = filtered.filter((e) => (e.scope || 'campus') === scope);
    res.json(filtered);
  } catch (err) {
    next(err);
  }
});

app.get('/api/events/:id', async (req, res, next) => {
  try {
    const events = await readJson(EVENTS_PATH);
    const event = events.find((e) => e.id === req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  } catch (err) {
    next(err);
  }
});

// A subscribable calendar feed — Google Calendar / Apple Calendar / Outlook
// can all add this by URL and will periodically re-fetch it for updates.
// Supports the same filters as /api/events so a club or category can get
// its own feed, e.g. /calendar.ics?clubId=coding-club
app.get('/calendar.ics', async (req, res, next) => {
  try {
    const [events, clubs] = await Promise.all([readJson(EVENTS_PATH), readJson(CLUBS_PATH)]);
    const { clubId, category, scope } = req.query;
    let filtered = events;
    if (clubId) filtered = filtered.filter((e) => e.clubId === clubId);
    if (category) filtered = filtered.filter((e) => e.category.toLowerCase() === String(category).toLowerCase());
    if (scope) filtered = filtered.filter((e) => (e.scope || 'campus') === scope);

    const clubById = Object.fromEntries(clubs.map((c) => [c.id, c]));
    const club = clubId ? clubById[clubId] : null;
    const calendarName = club ? `${club.name} — College Club Hub` : 'College Club Hub';
    const hostOrigin = `${req.protocol}://${req.get('host')}`;

    const ics = buildCalendar(filtered, clubById, { calendarName, hostOrigin });
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.send(ics);
  } catch (err) {
    next(err);
  }
});

app.post('/api/submit-event', async (req, res, next) => {
  try {
    const body = req.body || {};

    // Honeypot: a real visitor never fills this hidden field; a bot usually does.
    // Pretend to succeed so the bot doesn't learn to avoid it.
    if (clean(body.website, 200)) {
      return res.json({ ok: true });
    }

    if (isRateLimited(req.ip)) {
      return res.status(429).json({ error: 'Too many submissions from this connection. Try again later.' });
    }

    const title = clean(body.title, 150);
    const date = clean(body.date, 20);
    const category = clean(body.category, 40) || 'Technical';
    const scope = body.scope === 'inter-college' ? 'inter-college' : 'campus';
    const clubName = clean(body.clubName, 100);
    const hostCollege = clean(body.hostCollege, 150);

    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Event title and a valid date are required.' });
    }
    if (scope === 'campus' && !clubName) {
      return res.status(400).json({ error: 'Club name is required for a campus event.' });
    }
    if (scope === 'inter-college' && !hostCollege) {
      return res.status(400).json({ error: 'Host college name is required for an inter-college event.' });
    }

    const submission = {
      id: `pending-web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sourceId: `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      clubName,
      title,
      description: clean(body.description, 1000),
      date,
      dateConfirmed: body.dateConfirmed !== false,
      startTime: clean(body.startTime, 5),
      endTime: clean(body.endTime, 5),
      location: clean(body.location, 150),
      category,
      scope,
      hostCollege,
      submittedBy: clean(body.submittedBy, 100),
      submittedByEmail: clean(body.submittedByEmail, 150),
      receivedAt: new Date().toISOString()
    };

    const pending = await readJson(PENDING_PATH);
    pending.push(submission);
    await writeJson(PENDING_PATH, pending);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------- Admin auth ----------
// A real login: username/password checked server-side (never sent to the
// client), a signed httpOnly session cookie on success. See README for setup.

app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Server has no ADMIN_USERNAME/ADMIN_PASSWORD configured. Set them in .env first.' });
  }
  if (isLoginRateLimited(req.ip)) {
    return res.status(429).json({ error: 'Too many login attempts. Try again in a few minutes.' });
  }

  const { username, password } = req.body || {};
  const ok = username && password && safeEqual(username, ADMIN_USERNAME) && safeEqual(password, ADMIN_PASSWORD);
  if (!ok) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Could not start a session.' });
    req.session.isAdmin = true;
    res.json({ ok: true });
  });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/session', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.isAdmin) });
});

// ---------- Admin API (event submission review queue) ----------
// Protected by the session cookie set on login, above.

app.get('/api/admin/pending', requireAdminSession, async (req, res, next) => {
  try {
    const pending = await readJson(PENDING_PATH);
    res.json(pending);
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/sync', requireAdminSession, async (req, res, next) => {
  try {
    const csvUrl = (req.body && req.body.url) || DEFAULT_SHEET_CSV_URL;
    if (!csvUrl) {
      return res.status(400).json({ error: 'No Google Sheet CSV URL provided (pass { url } or set SHEET_CSV_URL in .env).' });
    }

    const response = await fetch(csvUrl);
    if (!response.ok) {
      return res.status(502).json({ error: `Could not fetch the sheet (HTTP ${response.status}). Check the published CSV URL.` });
    }
    const csvText = await response.text();
    const rows = csvToObjects(csvText);

    const [pending, events, rejectedIds] = await Promise.all([
      readJson(PENDING_PATH),
      readJson(EVENTS_PATH),
      readJsonOrDefault(REJECTED_IDS_PATH, [])
    ]);
    const knownIds = new Set([
      ...pending.map((p) => p.sourceId),
      ...events.map((e) => e.sourceId).filter(Boolean),
      ...rejectedIds
    ]);

    let added = 0;
    for (const row of rows) {
      const candidate = mapFormRowToPendingEvent(row);
      if (knownIds.has(candidate.sourceId)) continue;
      pending.push(candidate);
      knownIds.add(candidate.sourceId);
      added++;
    }

    await writeJson(PENDING_PATH, pending);
    res.json({ added, totalPending: pending.length });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/pending/:id/approve', requireAdminSession, async (req, res, next) => {
  try {
    const [pending, events, clubs] = await Promise.all([
      readJson(PENDING_PATH),
      readJson(EVENTS_PATH),
      readJson(CLUBS_PATH)
    ]);
    const idx = pending.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Pending submission not found' });

    const submission = pending[idx];
    const overrideClubId = req.body && req.body.clubId;
    let clubId = overrideClubId || null;
    if (!clubId && submission.clubName) {
      const match = clubs.find((c) => c.name.toLowerCase() === submission.clubName.toLowerCase());
      if (match) clubId = match.id;
    }

    const newEvent = {
      id: `evt-${Date.now()}`,
      clubId: clubId || null,
      title: submission.title,
      description: submission.description,
      date: submission.date,
      dateConfirmed: submission.dateConfirmed,
      startTime: submission.startTime,
      endTime: submission.endTime,
      location: submission.location,
      category: submission.category,
      scope: submission.scope,
      hostCollege: submission.hostCollege || undefined,
      sourceId: submission.sourceId
    };

    events.push(newEvent);
    pending.splice(idx, 1);

    await Promise.all([writeJson(EVENTS_PATH, events), writeJson(PENDING_PATH, pending)]);
    res.json(newEvent);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/admin/pending/:id', requireAdminSession, async (req, res, next) => {
  try {
    const [pending, rejectedIds] = await Promise.all([
      readJson(PENDING_PATH),
      readJsonOrDefault(REJECTED_IDS_PATH, [])
    ]);
    const idx = pending.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Pending submission not found' });
    const [removed] = pending.splice(idx, 1);
    if (removed.sourceId && !rejectedIds.includes(removed.sourceId)) {
      rejectedIds.push(removed.sourceId);
    }
    await Promise.all([writeJson(PENDING_PATH, pending), writeJson(REJECTED_IDS_PATH, rejectedIds)]);
    res.json(removed);
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

app.listen(PORT, () => {
  console.log(`College Club Events server running at http://localhost:${PORT}`);
});
