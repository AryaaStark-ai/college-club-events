document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('submit-form');
  const statusEl = document.getElementById('form-status');
  const submitBtn = document.getElementById('submit-btn');
  const clubNameRow = document.getElementById('club-name-row');
  const hostCollegeRow = document.getElementById('host-college-row');
  const clubNameInput = document.getElementById('clubName');
  const hostCollegeInput = document.getElementById('hostCollege');

  try {
    const clubs = await fetchJson('/api/clubs');
    const datalist = document.getElementById('known-clubs');
    datalist.innerHTML = clubs.map((c) => `<option value="${c.name}">`).join('');
  } catch (e) {}

  form.querySelectorAll('input[name="scope"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const isInterCollege = form.querySelector('input[name="scope"]:checked').value === 'inter-college';
      clubNameRow.style.display = isInterCollege ? 'none' : '';
      hostCollegeRow.style.display = isInterCollege ? '' : 'none';
      clubNameInput.required = !isInterCollege;
      hostCollegeInput.required = isInterCollege;
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    statusEl.textContent = 'Submitting...';
    statusEl.style.color = '';

    const formData = new FormData(form);
    const payload = {
      website: formData.get('website'),
      scope: formData.get('scope'),
      clubName: formData.get('clubName'),
      hostCollege: formData.get('hostCollege'),
      title: formData.get('title'),
      description: formData.get('description'),
      date: formData.get('date'),
      dateConfirmed: !formData.get('dateNotConfirmed'),
      startTime: formData.get('startTime'),
      endTime: formData.get('endTime'),
      location: formData.get('location'),
      category: formData.get('category'),
      submittedBy: formData.get('submittedBy'),
      submittedByEmail: formData.get('submittedByEmail')
    };

    try {
      const res = await fetch('/api/submit-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        statusEl.textContent = body.error || 'Something went wrong. Please try again.';
        statusEl.style.color = '#c81e3a';
        submitBtn.disabled = false;
        return;
      }
      form.reset();
      statusEl.textContent = "Thanks! Your event's been submitted and will show up on the site once it's reviewed.";
      submitBtn.disabled = false;
    } catch (err) {
      statusEl.textContent = 'Network error — please try again.';
      statusEl.style.color = '#c81e3a';
      submitBtn.disabled = false;
    }
  });
});
