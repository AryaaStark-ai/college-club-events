const CATEGORY_LIST = ['Technical', 'Cultural', 'Sports', 'Arts'];

// One consistent color per category, used on club badges, event date tiles,
// and the calendar. Inter-college events always override to the purple below.
const CATEGORY_COLORS = {
  Technical: '#a31621',
  Cultural: '#c9962b',
  Sports: '#1f7a4d',
  Arts: '#0e7c86'
};
const INTERCOLLEGE_COLOR = '#6b21a8';

function categoryColor(category) {
  return CATEGORY_COLORS[category] || 'var(--primary)';
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${url}`);
  return res.json();
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDate();
  const month = d.toLocaleString('en-US', { month: 'short' });
  return { day, month };
}

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

// Pure calendar-date math avoiding the browser's local timezone entirely —
// mixing local Date methods with UTC output rolls the date back a day for
// any timezone ahead of UTC (like IST). Mirrors lib/ics.js on the server.
function addOneDayStamp(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 1);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function googleCalendarUrl(event, organizerName) {
  const title = event.title + (event.dateConfirmed === false ? ' (tentative)' : '');
  let dates;
  if (event.startTime) {
    const day = event.date.replace(/-/g, '');
    const endTime = event.endTime && event.endTime !== event.startTime ? event.endTime : event.startTime;
    dates = `${day}T${event.startTime.replace(':', '')}00/${day}T${endTime.replace(':', '')}00`;
  } else {
    const day = event.date.replace(/-/g, '');
    dates = `${day}/${addOneDayStamp(event.date)}`;
  }
  const details = [event.description || '', organizerName ? `Organized by: ${organizerName}` : ''].filter(Boolean).join('\n\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates,
    details,
    location: event.location || '',
    ctz: 'Asia/Kolkata'
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function clubCardHtml(club) {
  return `
    <a class="card" href="club.html?id=${encodeURIComponent(club.id)}" style="text-decoration:none; border-top-color: ${categoryColor(club.category)};">
      <span class="badge" style="background: ${categoryColor(club.category)};">${club.category}</span>
      <h3>${club.name}</h3>
      <p class="tagline">${club.tagline || ''}</p>
      <span class="meta">${club.meetingTime || ''}</span>
    </a>`;
}

function eventItemHtml(event, club) {
  const { day, month } = formatDate(event.date);
  const isTentative = event.dateConfirmed === false;
  const isInterCollege = event.scope === 'inter-college';
  const organizerName = isInterCollege
    ? (event.hostCollege || event.clubName || 'Partner college')
    : (club ? club.name : event.clubName || '');
  const dotColor = isInterCollege ? INTERCOLLEGE_COLOR : categoryColor(event.category);

  const badges = [];
  badges.push(`<span class="badge" style="background:${dotColor};">${event.category}</span>`);
  if (isTentative) badges.push('<span class="badge badge-tentative">Date tentative</span>');
  if (isInterCollege) badges.push('<span class="badge badge-intercollege">🎓 Inter-college</span>');

  return `
    <div class="event-item${isInterCollege ? ' intercollege' : ''}">
      <div class="event-date${isTentative ? ' tentative' : ''}" style="--category-color: ${dotColor};"><span class="day">${isTentative ? '~' : day}</span><span class="month">${month}</span></div>
      <div class="event-body">
        <h3>${event.title}</h3>
        <p>${organizerName}${event.startTime ? ' &middot; ' + formatTime(event.startTime) + (event.endTime ? ' - ' + formatTime(event.endTime) : '') : ''}${event.location ? ' &middot; ' + event.location : ''}</p>
        <div class="badge-row">${badges.join('')}</div>
        <p>${event.description || ''}</p>
        <a class="add-to-gcal" href="${googleCalendarUrl(event, organizerName)}" target="_blank" rel="noopener">📅 Add to Google Calendar</a>
      </div>
    </div>`;
}

async function loadUpcomingEvents(selector, limit) {
  const container = document.querySelector(selector);
  const [events, clubs] = await Promise.all([fetchJson('/api/events'), fetchJson('/api/clubs')]);
  const clubById = Object.fromEntries(clubs.map((c) => [c.id, c]));
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events
    .filter((e) => e.date >= today && (e.scope || 'campus') !== 'inter-college')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);

  if (upcoming.length === 0) {
    container.innerHTML = '<div class="empty-state">No upcoming events right now — check back soon.</div>';
    return;
  }
  container.innerHTML = upcoming.map((e) => eventItemHtml(e, clubById[e.clubId])).join('');
}

async function loadIntercollegeEvents(selector, limit) {
  const container = document.querySelector(selector);
  const events = await fetchJson('/api/events?scope=inter-college');
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);

  if (upcoming.length === 0) {
    container.innerHTML = '<div class="empty-state">No announcements from other colleges right now.</div>';
    return;
  }
  container.innerHTML = upcoming.map((e) => eventItemHtml(e, null)).join('');
}

async function loadClubs(selector, limit) {
  const container = document.querySelector(selector);
  const clubs = await fetchJson('/api/clubs');
  const shown = limit ? clubs.slice(0, limit) : clubs;
  container.innerHTML = shown.map(clubCardHtml).join('');
}

async function loadClubsPage() {
  const clubs = await fetchJson('/api/clubs');
  const grid = document.querySelector('#club-grid');
  const filterBar = document.querySelector('#category-filters');

  function render(category) {
    const shown = category ? clubs.filter((c) => c.category === category) : clubs;
    grid.innerHTML = shown.length
      ? shown.map(clubCardHtml).join('')
      : '<div class="empty-state">No clubs in this category yet.</div>';
  }

  const categories = ['All', ...CATEGORY_LIST];
  filterBar.innerHTML = categories
    .map((c, i) => `<button data-cat="${c === 'All' ? '' : c}" class="${i === 0 ? 'active' : ''}">${c}</button>`)
    .join('');

  filterBar.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') return;
    filterBar.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    e.target.classList.add('active');
    render(e.target.dataset.cat);
  });

  render('');
}

async function loadClubDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const detailEl = document.querySelector('#club-detail');
  const eventsEl = document.querySelector('#club-events');

  if (!id) {
    detailEl.innerHTML = '<div class="empty-state">No club specified.</div>';
    return;
  }

  try {
    const club = await fetchJson(`/api/clubs/${encodeURIComponent(id)}`);
    document.title = `${club.name} — College Club Hub`;
    detailEl.innerHTML = `
      <div class="club-detail" style="--category-color: ${categoryColor(club.category)};">
        <span class="badge" style="background: ${categoryColor(club.category)};">${club.category}</span>
        <h1>${club.name}</h1>
        <p class="tagline">${club.tagline || ''}</p>
        <p>${club.description || ''}</p>
        <p class="meta">Meets: ${club.meetingTime || 'TBA'}</p>
        <p>
          ${club.contactEmail ? `<a class="btn" href="mailto:${club.contactEmail}">Contact</a>` : ''}
          ${club.instagram ? ` &nbsp; <a href="${club.instagram}" target="_blank" rel="noopener">Instagram &rarr;</a>` : ''}
          &nbsp; <a href="/calendar.ics?clubId=${encodeURIComponent(club.id)}">📅 Subscribe to just this club's events</a>
        </p>
      </div>`;

    const events = await fetchJson(`/api/events?clubId=${encodeURIComponent(id)}`);
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    eventsEl.innerHTML = upcoming.length
      ? upcoming.map((e) => eventItemHtml(e, club)).join('')
      : '<div class="empty-state">No upcoming events from this club.</div>';
  } catch (err) {
    detailEl.innerHTML = '<div class="empty-state">Club not found.</div>';
  }
}
