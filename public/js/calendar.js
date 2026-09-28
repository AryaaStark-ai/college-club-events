document.addEventListener('DOMContentLoaded', async () => {
  const [events, clubs] = await Promise.all([fetchJson('/api/events'), fetchJson('/api/clubs')]);
  const clubById = Object.fromEntries(clubs.map((c) => [c.id, c]));

  const categoryColors = {
    Technical: '#4f46e5',
    Cultural: '#e11d48',
    Sports: '#059669',
    Arts: '#d97706'
  };

  function toFullCalendarEvents(list) {
    return list.map((e) => ({
      id: e.id,
      title: e.title,
      start: e.endTime && e.endTime !== e.startTime ? `${e.date}T${e.startTime}` : e.date,
      end: e.endTime && e.endTime !== e.startTime ? `${e.date}T${e.endTime}` : undefined,
      allDay: !e.startTime,
      color: categoryColors[e.category] || '#4f46e5',
      extendedProps: e
    }));
  }

  const calendarEl = document.getElementById('calendar');
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' },
    height: 'auto',
    events: toFullCalendarEvents(events),
    eventClick(info) {
      const e = info.event.extendedProps;
      const club = clubById[e.clubId];
      alert(
        `${info.event.title}\n` +
        `${club ? club.name : ''}\n` +
        `${e.date} ${e.startTime ? formatTime(e.startTime) : ''}\n` +
        `${e.location || ''}\n\n` +
        `${e.description || ''}`
      );
    }
  });
  calendar.render();

  const filterBar = document.querySelector('#category-filters');
  const categories = ['All', ...CATEGORY_LIST];
  filterBar.innerHTML = categories
    .map((c, i) => `<button data-cat="${c === 'All' ? '' : c}" class="${i === 0 ? 'active' : ''}">${c}</button>`)
    .join('');

  filterBar.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') return;
    filterBar.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    e.target.classList.add('active');
    const cat = e.target.dataset.cat;
    const filtered = cat ? events.filter((ev) => ev.category === cat) : events;
    calendar.removeAllEvents();
    calendar.addEventSource(toFullCalendarEvents(filtered));
  });
});
