(function () {
  const URL_STORAGE = 'cch-sheet-url';

  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');
  const loginForm = document.getElementById('login-form');
  const loginStatus = document.getElementById('login-status');
  const urlInput = document.getElementById('sheet-url');
  const statusLine = document.getElementById('status-line');
  const listEl = document.getElementById('pending-list');

  try {
    urlInput.value = localStorage.getItem(URL_STORAGE) || '';
  } catch (e) {}

  function showDashboard() {
    loginView.style.display = 'none';
    dashboardView.style.display = '';
    loadPending();
  }

  function showLogin() {
    loginView.style.display = '';
    dashboardView.style.display = 'none';
  }

  async function checkSession() {
    const res = await fetch('/api/admin/session');
    const body = await res.json().catch(() => ({ authenticated: false }));
    if (body.authenticated) showDashboard();
    else showLogin();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const loginBtn = document.getElementById('login-btn');
    loginBtn.disabled = true;
    loginStatus.textContent = 'Logging in...';
    loginStatus.style.color = '';

    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        loginStatus.textContent = body.error || 'Login failed.';
        loginStatus.style.color = '#c81e3a';
        loginBtn.disabled = false;
        return;
      }
      loginForm.reset();
      loginStatus.textContent = '';
      showDashboard();
    } catch (err) {
      loginStatus.textContent = 'Network error — please try again.';
      loginStatus.style.color = '#c81e3a';
    }
    loginBtn.disabled = false;
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    showLogin();
  });

  function setStatus(msg, isError) {
    statusLine.textContent = msg;
    statusLine.style.color = isError ? '#c81e3a' : '';
  }

  async function loadPending() {
    setStatus('Loading pending submissions...');
    const res = await fetch('/api/admin/pending');
    if (res.status === 401) {
      showLogin();
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStatus(body.error || 'Could not load pending submissions.', true);
      listEl.innerHTML = '';
      return;
    }
    const pending = await res.json();
    renderPending(pending);
    setStatus(`${pending.length} pending submission${pending.length === 1 ? '' : 's'}.`);
  }

  async function renderPending(pending) {
    if (pending.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No pending submissions. New submissions from the site or a Google Form will show up here.</div>';
      return;
    }

    let clubs = [];
    try { clubs = await fetchJson('/api/clubs'); } catch (e) {}

    listEl.innerHTML = pending
      .map((p) => {
        const clubOptions = clubs
          .map((c) => `<option value="${c.id}">${c.name}</option>`)
          .join('');
        return `
          <div class="pending-item" data-id="${p.id}">
            <h3>${p.title}</h3>
            <div class="fields">
              <div><strong>Club (as typed):</strong> ${p.clubName || '—'}</div>
              <div><strong>Date:</strong> ${p.date || '—'}${p.dateConfirmed === false ? ' (tentative)' : ''}</div>
              <div><strong>Time:</strong> ${p.startTime || '—'}${p.endTime ? ' - ' + p.endTime : ''}</div>
              <div><strong>Location:</strong> ${p.location || '—'}</div>
              <div><strong>Category:</strong> ${p.category || '—'}</div>
              <div><strong>Scope:</strong> ${p.scope === 'inter-college' ? `Inter-college (${p.hostCollege || 'unknown host'})` : 'This campus'}</div>
              <div><strong>Submitted by:</strong> ${p.submittedBy || '—'} ${p.submittedByEmail ? `(${p.submittedByEmail})` : ''}</div>
            </div>
            <p>${p.description || ''}</p>
            <div class="pending-actions">
              <label class="meta">Assign to club:
                <select class="club-select">
                  <option value="">— not listed / inter-college —</option>
                  ${clubOptions}
                </select>
              </label>
              <button class="btn approve-btn">Approve &amp; publish</button>
              <button class="btn btn-danger reject-btn">Reject</button>
            </div>
          </div>`;
      })
      .join('');

    listEl.querySelectorAll('.approve-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const item = e.target.closest('.pending-item');
        const id = item.dataset.id;
        const clubId = item.querySelector('.club-select').value;
        btn.disabled = true;
        const res = await fetch(`/api/admin/pending/${encodeURIComponent(id)}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clubId: clubId || undefined })
        });
        if (res.status === 401) return showLogin();
        if (res.ok) {
          item.remove();
          setStatus('Published.');
        } else {
          const body = await res.json().catch(() => ({}));
          setStatus(body.error || 'Could not approve.', true);
          btn.disabled = false;
        }
      });
    });

    listEl.querySelectorAll('.reject-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const item = e.target.closest('.pending-item');
        const id = item.dataset.id;
        if (!confirm('Reject and discard this submission?')) return;
        btn.disabled = true;
        const res = await fetch(`/api/admin/pending/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (res.status === 401) return showLogin();
        if (res.ok) {
          item.remove();
          setStatus('Rejected.');
        } else {
          const body = await res.json().catch(() => ({}));
          setStatus(body.error || 'Could not reject.', true);
          btn.disabled = false;
        }
      });
    });
  }

  document.getElementById('sync-btn').addEventListener('click', async () => {
    try { localStorage.setItem(URL_STORAGE, urlInput.value); } catch (e) {}
    setStatus('Syncing from Google Sheet...');
    const res = await fetch('/api/admin/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urlInput.value || undefined })
    });
    if (res.status === 401) return showLogin();
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(body.error || 'Sync failed.', true);
      return;
    }
    setStatus(`Synced — ${body.added} new submission(s) found.`);
    loadPending();
  });

  checkSession();
})();
