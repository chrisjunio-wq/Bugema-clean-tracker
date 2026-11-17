
'use strict';

/* =========================================================
   BUGEMA CLEAN COMMUNITY TRACKER
   Waste collection log management
   ========================================================= */

(() => {
  const $ = (id) => document.getElementById(id);

  let logs = [];
  let locations = [];
  let teams = [];
  let editingLogId = null;

  function escapeHtml(value) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(value)
      : String(value ?? '').replace(/[&<>"']/g, (character) => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;'
        })[character]);
  }

  async function request(endpoint, options = {}) {
    if (typeof window.apiRequest !== 'function') {
      throw new Error('The main application API client is unavailable.');
    }

    return window.apiRequest(endpoint, options);
  }

  function recordId(record) {
    return record?._id ?? record?.id ?? '';
  }

  function setMessage(message, isError = false) {
    const element = $('logMessage') || $('logsMessage');

    if (!element) return;

    element.textContent = message;
    element.style.color = isError ? '#b42318' : '#267344';
  }

  function formatDate(value) {
    if (!value) return '—';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return '—';

    return date.toLocaleDateString('en-UG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function dateInputValue(value) {
    if (!value) return '';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  function rowsContainer() {
    const table = $('logRowsTable');

    return table
      ? table.querySelector('tbody') || table
      : null;
  }

  function locationName(log) {
    return log.location?.name ||
      log.locationName ||
      locations.find((item) =>
        String(recordId(item)) === String(log.locationId?._id || log.locationId)
      )?.name ||
      '—';
  }

  function teamName(log) {
    return log.team?.name ||
      log.assignedTeam?.name ||
      log.teamName ||
      teams.find((item) =>
        String(recordId(item)) === String(log.teamId?._id || log.teamId)
      )?.name ||
      '—';
  }

  function renderLogs() {
    const body = rowsContainer();

    if (!body) return;

    if (!logs.length) {
      body.innerHTML = `
        <tr>
          <td colspan="8">No collection records found.</td>
        </tr>
      `;
      return;
    }

    body.innerHTML = logs.map((log) => {
      const id = recordId(log);

      const status = String(log.status || 'scheduled').toLowerCase();

      return `
        <tr>
          <td>${escapeHtml(locationName(log))}</td>
          <td>${escapeHtml(teamName(log))}</td>
          <td>${escapeHtml(formatDate(log.scheduledFor || log.collectionDate || log.createdAt))}</td>
          <td>
            <span class="status-badge status-${escapeHtml(status)}">
              ${escapeHtml(status)}
            </span>
          </td>
          <td>${escapeHtml(log.wasteType || '—')}</td>
          <td>${escapeHtml(log.note || log.notes || '—')}</td>
          <td>${escapeHtml(formatDate(log.completedAt))}</td>
          <td>
            <button type="button" onclick="editLog('${escapeHtml(id)}')">
              Edit
            </button>
            <button type="button" onclick="deleteLog('${escapeHtml(id)}')">
              Delete
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function updateDropdowns() {
    const locationSelect = $('logLocation');

    if (locationSelect) {
      const previous = locationSelect.value;
      const placeholder = locationSelect.options[0]?.textContent || 'Select location';

      locationSelect.innerHTML = '';
      locationSelect.add(new Option(placeholder, ''));

      locations.forEach((location) => {
        locationSelect.add(new Option(
          location.name || 'Unnamed location',
          recordId(location)
        ));
      });

      if (locations.some((item) => String(recordId(item)) === previous)) {
        locationSelect.value = previous;
      }
    }

    const teamSelect = $('logTeam');

    if (teamSelect) {
      const previous = teamSelect.value;
      const placeholder = teamSelect.options[0]?.textContent || 'Select team';

      teamSelect.innerHTML = '';
      teamSelect.add(new Option(placeholder, ''));

      teams.forEach((team) => {
        teamSelect.add(new Option(
          team.name || 'Unnamed team',
          recordId(team)
        ));
      });

      if (teams.some((item) => String(recordId(item)) === previous)) {
        teamSelect.value = previous;
      }
    }
  }

  async function loadReferenceData() {
    const [locationResult, teamResult] = await Promise.all([
      request('/locations'),
      request('/teams')
    ]);

    locations = Array.isArray(locationResult)
      ? locationResult
      : locationResult.locations || locationResult.data || [];

    teams = Array.isArray(teamResult)
      ? teamResult
      : teamResult.teams || teamResult.data || [];

    updateDropdowns();
  }

  async function loadLogs() {
    try {
      const [logResult] = await Promise.all([
        request('/logs'),
        loadReferenceData()
      ]);

      logs = Array.isArray(logResult)
        ? logResult
        : logResult.logs || logResult.data || [];

      renderLogs();

      setMessage(`${logs.length} collection record(s) loaded.`);

      return logs;
    } catch (error) {
      setMessage(error.message, true);
      console.error('Collection log loading failed:', error);
      throw error;
    }
  }

  function resetLogForm() {
    editingLogId = null;

    [
      'logLocation',
      'logTeam',
      'logDate',
      'logStatus',
      'logWaste',
      'logNote'
    ].forEach((id) => {
      if ($(id)) $(id).value = '';
    });

    if ($('logFormTitle')) {
      $('logFormTitle').textContent = 'Add Collection Record';
    }

    setMessage('');
  }

  function editLog(id) {
    const log = logs.find(
      (item) => String(recordId(item)) === String(id)
    );

    if (!log) {
      setMessage('The selected collection record could not be found.', true);
      return;
    }

    editingLogId = id;

    if ($('logLocation')) {
      $('logLocation').value =
        log.locationId?._id ||
        log.locationId ||
        log.location?._id ||
        '';
    }

    if ($('logTeam')) {
      $('logTeam').value =
        log.teamId?._id ||
        log.teamId ||
        log.team?._id ||
        log.assignedTeam?._id ||
        '';
    }

    if ($('logDate')) {
      $('logDate').value = dateInputValue(
        log.scheduledFor || log.collectionDate || log.createdAt
      );
    }

    if ($('logStatus')) {
      $('logStatus').value = log.status || 'scheduled';
    }

    if ($('logWaste')) {
      $('logWaste').value = log.wasteType || '';
    }

    if ($('logNote')) {
      $('logNote').value = log.note || log.notes || '';
    }

    if ($('logFormTitle')) {
      $('logFormTitle').textContent = 'Edit Collection Record';
    }

    $('logCard')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  async function saveLog(event) {
    if (event) event.preventDefault();

    const locationId = $('logLocation')?.value || '';
    const teamId = $('logTeam')?.value || '';
    const scheduledFor = $('logDate')?.value || '';
    const status = $('logStatus')?.value || '';
    const wasteType = $('logWaste')?.value.trim() || '';
    const note = $('logNote')?.value.trim() || '';

    if (!locationId || !teamId || !scheduledFor || !status) {
      setMessage('Select a location, team, collection date and status.', true);
      return;
    }

    const parsedDate = new Date(`${scheduledFor}T00:00:00`);

    if (Number.isNaN(parsedDate.getTime())) {
      setMessage('Enter a valid collection date.', true);
      return;
    }

    const body = {
      locationId,
      teamId,
      scheduledFor: parsedDate.toISOString(),
      status,
      wasteType,
      note
    };

    const button = document.querySelector(
      '#logCard button[onclick*="saveLog"]'
    );

    if (button) {
      button.disabled = true;
      button.dataset.oldText = button.textContent;
      button.textContent = 'Saving...';
    }

    try {
      if (editingLogId) {
        await request(`/logs/${encodeURIComponent(editingLogId)}`, {
          method: 'PUT',
          body: JSON.stringify(body)
        });
      } else {
        await request('/logs', {
          method: 'POST',
          body: JSON.stringify(body)
        });
      }

      resetLogForm();

      await loadLogs();

      if (typeof window.loadDashboard === 'function') {
        await window.loadDashboard();
      }

      setMessage('Collection record saved successfully.');
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = button.dataset.oldText || 'Save Record';
      }
    }
  }

  async function deleteLog(id) {
    const log = logs.find(
      (item) => String(recordId(item)) === String(id)
    );

    if (!log) {
      setMessage('The selected collection record could not be found.', true);
      return;
    }

    if (!confirm('Delete this collection record? This action cannot be undone.')) {
      return;
    }

    try {
      await request(`/logs/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });

      if (String(editingLogId) === String(id)) {
        resetLogForm();
      }

      await loadLogs();

      if (typeof window.loadDashboard === 'function') {
        await window.loadDashboard();
      }

      setMessage('Collection record deleted successfully.');
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  function initialise() {
    const form = $('logForm');

    if (form) {
      form.addEventListener('submit', saveLog);
    }

    const search = $('logSearch');

    if (search) {
      search.addEventListener('input', () => {
        const query = search.value.trim().toLowerCase();

        const filtered = logs.filter((log) =>
          [
            locationName(log),
            teamName(log),
            log.status,
            log.wasteType,
            log.note
          ].join(' ').toLowerCase().includes(query)
        );

        const original = logs;
        logs = filtered;
        renderLogs();
        logs = original;
      });
    }
  }

  window.loadLogs = loadLogs;
  window.renderLogs = renderLogs;
  window.saveLog = saveLog;
  window.editLog = editLog;
  window.deleteLog = deleteLog;
  window.resetLogForm = resetLogForm;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialise);
  } else {
    initialise();
  }
})();
