(function () {
  var PRIORITY_LABELS = { 1: 'critical', 2: 'high', 3: 'normal', 4: 'low' };
  var jobsBody = document.getElementById('jobs-body');
  var lastUpdated = document.getElementById('last-updated');
  var healthDot = document.getElementById('health-dot');
  var healthText = document.getElementById('health-text');

  function timeAgo(iso) {
    if (!iso) return '—';
    var diff = Date.now() - new Date(iso).getTime();
    if (diff < 0) diff = 0;
    var s = Math.floor(diff / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return s + 's ago';
    var m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    return h + 'h ago';
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderStats(stats) {
    var c = stats.counts || {};
    document.querySelector('[data-stat="waiting"]').textContent = c.waiting ?? 0;
    document.querySelector('[data-stat="active"]').textContent = c.active ?? 0;
    document.querySelector('[data-stat="completed"]').textContent = c.completed ?? 0;
    document.querySelector('[data-stat="failed"]').textContent = c.failed ?? 0;
    document.querySelector('[data-stat="delayed"]').textContent = c.delayed ?? 0;
    document.querySelector('[data-stat="deadletter"]').textContent = (stats.deadLetter && stats.deadLetter.total) ?? 0;
  }

  function renderJobs(list) {
    if (!list || list.length === 0) {
      jobsBody.innerHTML = '<tr><td colspan="7" class="empty-state">No jobs yet — submit one on the left to see it here.</td></tr>';
      return;
    }
    jobsBody.innerHTML = list.map(function (job) {
      var priorityLabel = PRIORITY_LABELS[job.priority] || job.priority || '—';
      var payloadStr = '';
      try { payloadStr = JSON.stringify(job.payload || {}); } catch (e) { payloadStr = ''; }
      return '<tr>' +
        '<td class="id">#' + escapeHtml(job.id) + '</td>' +
        '<td class="type">' + escapeHtml(job.type) + '</td>' +
        '<td><span class="status-pill ' + escapeHtml(job.status) + '"><span class="dot"></span>' + escapeHtml(job.status) + '</span></td>' +
        '<td>' + escapeHtml(priorityLabel) + '</td>' +
        '<td>' + escapeHtml(job.attemptsMade ?? 0) + '</td>' +
        '<td class="payload" title="' + escapeHtml(payloadStr) + '">' + escapeHtml(payloadStr) + '</td>' +
        '<td>' + escapeHtml(timeAgo(job.enqueuedAt)) + '</td>' +
        '</tr>';
    }).join('');
  }

  function setHealth(ok) {
    healthDot.className = 'dot ' + (ok ? 'live' : 'down');
    healthText.textContent = ok ? 'Live' : 'Unreachable';
  }

  function refresh() {
    fetch('/health').then(function (r) { return r.ok; }).catch(function () { return false; })
      .then(setHealth);

    Promise.all([
      fetch('/api/queue/stats').then(function (r) { return r.json(); }),
      fetch('/api/jobs?status=all&start=0&end=9').then(function (r) { return r.json(); })
    ]).then(function (results) {
      renderStats(results[0]);
      renderJobs(results[1].jobs);
      lastUpdated.textContent = 'Last updated ' + new Date().toLocaleTimeString();
    }).catch(function () {
      lastUpdated.textContent = 'Could not reach the API — retrying…';
    });
  }

  document.getElementById('job-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var toast = document.getElementById('form-toast');
    var type = document.getElementById('f-type').value.trim();
    var priority = document.getElementById('f-priority').value;
    var delayMs = Number(document.getElementById('f-delay').value || 0);
    var payloadRaw = document.getElementById('f-payload').value.trim();
    var payload;
    try {
      payload = payloadRaw ? JSON.parse(payloadRaw) : {};
    } catch (err) {
      toast.className = 'toast err show';
      toast.textContent = 'Payload must be valid JSON: ' + err.message;
      return;
    }

    fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: type, priority: priority, delayMs: delayMs, payload: payload })
    })
      .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
      .then(function (res) {
        if (res.ok) {
          toast.className = 'toast ok show';
          toast.textContent = 'Job #' + res.body.id + ' enqueued (' + res.body.priority + ' priority).';
          refresh();
        } else {
          toast.className = 'toast err show';
          toast.textContent = res.body.message || (res.body.details && res.body.details.join(', ')) || 'Failed to enqueue job.';
        }
      })
      .catch(function () {
        toast.className = 'toast err show';
        toast.textContent = 'Network error — could not reach the API.';
      });
  });

  refresh();
  setInterval(refresh, 5000);
})();
