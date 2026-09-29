function renderLegend() {
  const el = document.querySelector('#category-legend');
  if (!el) return;
  const items = [...CATEGORY_LIST.map((c) => ({ label: c, color: categoryColor(c) })), { label: 'Inter-college', color: INTERCOLLEGE_COLOR }];
  el.innerHTML = items.map((i) => `<span><span class="dot" style="background:${i.color};"></span>${i.label}</span>`).join('');
}

function wireSubscribeLinks() {
  const icsPath = '/calendar.ics';
  const httpsUrl = `${window.location.origin}${icsPath}`;
  const webcalUrl = `webcal://${window.location.host}${icsPath}`;

  const webcalLink = document.getElementById('webcal-link');
  if (webcalLink) webcalLink.href = webcalUrl;

  const copyBtn = document.getElementById('copy-ics-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(httpsUrl);
        const original = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = original; }, 1800);
      } catch (e) {
        prompt('Copy this link:', httpsUrl);
      }
    });
  }

  const trigger = document.getElementById('subscribe-trigger');
  const popover = document.getElementById('subscribe-popover');
  if (trigger && popover) {
    function positionPopover() {
      const rect = trigger.getBoundingClientRect();
      const popWidth = popover.offsetWidth || 280;
      const margin = 8;
      let left = rect.right - popWidth;
      left = Math.max(margin, Math.min(left, window.innerWidth - popWidth - margin));
      popover.style.left = `${left}px`;
      popover.style.top = `${rect.bottom + margin}px`;
    }
    function openPopover() {
      popover.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      positionPopover();
    }
    function closePopover() {
      popover.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (popover.hidden) openPopover(); else closePopover();
    });
    document.addEventListener('click', (e) => {
      if (!popover.hidden && !popover.contains(e.target) && e.target !== trigger) closePopover();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePopover();
    });
    window.addEventListener('resize', () => {
      if (!popover.hidden) positionPopover();
    });
  }
}

function wireEventModal() {
  const overlay = document.getElementById('event-modal-overlay');
  const card = document.getElementById('event-modal-card');
  const closeBtn = document.getElementById('event-modal-close');
  const body = document.getElementById('event-modal-body');
  if (!overlay) return null;

  function close() {
    overlay.hidden = true;
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });

  function open(event, club) {
    const isTentative = event.dateConfirmed === false;
    const isInterCollege = event.scope === 'inter-college';
    const organizerName = isInterCollege
      ? (event.hostCollege || event.clubName || 'Partner college')
      : (club ? club.name : event.clubName || '');
    const dotColor = isInterCollege ? INTERCOLLEGE_COLOR : categoryColor(event.category);

    const badges = [`<span class="badge" style="background:${dotColor};">${event.category}</span>`];
    if (isTentative) badges.push('<span class="badge badge-tentative">Date tentative</span>');
    if (isInterCollege) badges.push('<span class="badge badge-intercollege">🎓 Inter-college</span>');

    const { day, month } = formatDate(event.date);
    const dateLine = `${month} ${day}, ${event.date.slice(0, 4)}${isTentative ? ' (tentative)' : ''}`;
    const timeLine = event.startTime
      ? formatTime(event.startTime) + (event.endTime && event.endTime !== event.startTime ? ' – ' + formatTime(event.endTime) : '')
      : '';

    card.style.setProperty('--category-color', dotColor);
    body.innerHTML = `
      <div class="badge-row">${badges.join('')}</div>
      <h3 id="event-modal-title">${event.title}</h3>
      <p class="meta-line">
        ${organizerName ? organizerName + '<br>' : ''}
        ${dateLine}${timeLine ? ' &middot; ' + timeLine : ''}
        ${event.location ? '<br>' + event.location : ''}
      </p>
      ${event.description ? `<p class="description">${event.description}</p>` : ''}
      <a class="add-to-gcal" href="${googleCalendarUrl(event, organizerName)}" target="_blank" rel="noopener">📅 Add to Google Calendar</a>
    `;
    overlay.hidden = false;
  }

  return { open, close };
}

document.addEventListener('DOMContentLoaded', async () => {
  const [events, clubs] = await Promise.all([fetchJson('/api/events'), fetchJson('/api/clubs')]);
  const clubById = Object.fromEntries(clubs.map((c) => [c.id, c]));

  renderLegend();
  wireSubscribeLinks();
  const eventModal = wireEventModal();

  let activeCategory = '';
  let activeScope = '';

  function applyFilters() {
    return events.filter((e) => {
      if (activeCategory && e.category !== activeCategory) return false;
      if (activeScope && (e.scope || 'campus') !== activeScope) return false;
      return true;
    });
  }

  function toFullCalendarEvents(list) {
    return list.map((e) => {
      const isTentative = e.dateConfirmed === false;
      const isInterCollege = e.scope === 'inter-college';
      const classNames = [];
      if (isTentative) classNames.push('tentative-event');
      if (isInterCollege) classNames.push('intercollege-event');
      return {
        id: e.id,
        title: `${isInterCollege ? '🎓 ' : ''}${e.title}${isTentative ? ' (tentative)' : ''}`,
        start: e.endTime && e.endTime !== e.startTime ? `${e.date}T${e.startTime}` : e.date,
        end: e.endTime && e.endTime !== e.startTime ? `${e.date}T${e.endTime}` : undefined,
        allDay: !e.startTime,
        color: isInterCollege ? INTERCOLLEGE_COLOR : categoryColor(e.category),
        classNames,
        extendedProps: e
      };
    });
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
      if (eventModal) eventModal.open(e, club);
    }
  });
  calendar.render();

  function refresh() {
    calendar.removeAllEvents();
    calendar.addEventSource(toFullCalendarEvents(applyFilters()));
  }

  const filterBar = document.querySelector('#category-filters');
  const categories = ['All', ...CATEGORY_LIST];
  filterBar.innerHTML = categories
    .map((c, i) => `<button data-cat="${c === 'All' ? '' : c}" class="${i === 0 ? 'active' : ''}">${c}</button>`)
    .join('');

  filterBar.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') return;
    filterBar.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    e.target.classList.add('active');
    activeCategory = e.target.dataset.cat;
    refresh();
  });

  const scopeBar = document.querySelector('#scope-filters');
  if (scopeBar) {
    const scopes = [
      { label: 'All events', value: '' },
      { label: 'This campus', value: 'campus' },
      { label: '🎓 Inter-college', value: 'inter-college' }
    ];
    scopeBar.innerHTML = scopes
      .map((s, i) => `<button data-scope="${s.value}" class="${i === 0 ? 'active' : ''}">${s.label}</button>`)
      .join('');

    scopeBar.addEventListener('click', (e) => {
      if (e.target.tagName !== 'BUTTON') return;
      scopeBar.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      e.target.classList.add('active');
      activeScope = e.target.dataset.scope;
      refresh();
    });
  }
});
