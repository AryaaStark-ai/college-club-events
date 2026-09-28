(function () {
  const KEY_STORAGE = 'cch-admin-key';
  const URL_STORAGE = 'cch-sheet-url';

  const keyInput = document.getElementById('admin-key');
  const urlInput = document.getElementById('sheet-url');
  const statusLine = document.getElementById('status-line');
  const listEl = document.getElementById('pending-list');

  try {
    keyInput.value = localStorage.getItem(KEY_STORAGE) || '';
    urlInput.value = localStorage.getItem(URL_STORAGE) || '';
  } catch (e) {}

  function adminHeaders() {
    return { 'x-admin-key': keyInput.value, 'Content-Type': 'application/json' };
  }

  function setStatus(msg, isError) {
    statusLine.textContent = msg;
    statusLine.style.color = isError ? '#c81e3a' : '';
  }

  document.getElementById('save-key-btn').addEventListener('click', () => {
    try {
      localStorage.setItem(KEY_STORAGE, keyInput.value);
      localStorage.setItem(URL_STORAGE, urlInput.value);
    } catch (e) {}
    setStatus('Saved for this browser.');
  });

  async function loadPending() {
    if (!keyInput.value) {
      setStatus('Enter your admin key first.', true);
      return;
    }
    setStatus('Loading pending submissions...');
    const res = await fetch('/api/admin/pending', { headers: adminHeaders() });
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
      listEl.innerHTML = '<div class="empty-state">No pending submissions. New Google Form responses will show up here after you sync.</div>';
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
          headers: adminHeaders(),
          body: JSON.stringify({ clubId: clubId || undefined })
        });
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
        const res = await fetch(`/api/admin/pending/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: adminHeaders()
        });
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
    if (!keyInput.value) {
      setStatus('Enter your admin key first.', true);
      return;
    }
    setStatus('Syncing from Google Sheet...');
    const res = await fetch('/api/admin/sync', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ url: urlInput.value || undefined })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(body.error || 'Sync failed.', true);
      return;
    }
    setStatus(`Synced — ${body.added} new submission(s) found.`);
    loadPending();
  });

  loadPending();
})();
