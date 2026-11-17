
'use strict';

/* =========================================================
   BUGEMA CLEAN COMMUNITY TRACKER
   Cleanup team management
   ========================================================= */

(() => {
  const $ = (id) => document.getElementById(id);

  let teams = [];
  let editingTeamId = null;

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
    const element = $('teamMessage') || $('teamsMessage');

    if (!element) return;

    element.textContent = message;
    element.style.color = isError ? '#b42318' : '#267344';
  }

  function rowsContainer() {
    const table = $('teamRowsTable');
    return table ? table.querySelector('tbody') || table : null;
  }

  function renderTeams() {
    const body = rowsContainer();
    if (!body) return;

    if (!teams.length) {
      body.innerHTML = `
        <tr>
          <td colspan="8">No cleanup teams have been registered.</td>
        </tr>
      `;
      updateTeamDropdowns();
      return;
    }

    body.innerHTML = teams.map((team) => {
      const id = recordId(team);

      const zones = Array.isArray(team.zones)
        ? team.zones.join(', ')
        : team.zones || '—';

      const members = Array.isArray(team.members)
        ? team.members.join(', ')
        : team.members || '—';

      return `
        <tr>
          <td>${escapeHtml(team.name || '—')}</td>
          <td>${escapeHtml(team.organization || '—')}</td>
          <td>${escapeHtml(team.supervisor || '—')}</td>
          <td>${escapeHtml(team.phone || '—')}</td>
          <td>${escapeHtml(zones)}</td>
          <td>${escapeHtml(members)}</td>
          <td>${escapeHtml(team.shift || '—')}</td>
          <td>
            <button type="button" onclick="editTeam('${escapeHtml(id)}')">
              Edit
            </button>
            <button type="button" onclick="deleteTeam('${escapeHtml(id)}')">
              Delete
            </button>
          </td>
        </tr>
      `;
    }).join('');

    updateTeamDropdowns();
  }

  function updateTeamDropdowns() {
    const dropdownIds = [
      'editTeam',
      'logTeam',
      'teamFilter'
    ];

    dropdownIds.forEach((id) => {
      const select = $(id);
      if (!select) return;

      const previousValue = select.value;
      const placeholder = select.options[0]?.textContent || 'Select team';

      select.innerHTML = '';
      select.add(new Option(placeholder, ''));

      teams.forEach((team) => {
        select.add(new Option(team.name || 'Unnamed team', recordId(team)));
      });

      if (teams.some((team) => String(recordId(team)) === previousValue)) {
        select.value = previousValue;
      }
    });
  }

  async function loadTeams() {
    try {
      const result = await request('/teams');

      teams = Array.isArray(result)
        ? result
        : result.teams || result.data || [];

      renderTeams();
      setMessage(`${teams.length} team(s) loaded.`);

      return teams;
    } catch (error) {
      setMessage(error.message, true);
      console.error('Team loading failed:', error);
      throw error;
    }
  }

  function parseList(value) {
    return String(value || '')
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function resetTeamForm() {
    editingTeamId = null;

    [
      'teamName',
      'teamOrg',
      'teamSupervisor',
      'teamPhone',
      'teamZones',
      'teamMembers',
      'teamShift'
    ].forEach((id) => {
      if ($(id)) $(id).value = '';
    });

    if ($('teamFormTitle')) {
      $('teamFormTitle').textContent = 'Add Cleanup Team';
    }

    setMessage('');
  }

  function editTeam(id) {
    const team = teams.find(
      (item) => String(recordId(item)) === String(id)
    );

    if (!team) {
      setMessage('The selected team could not be found.', true);
      return;
    }

    editingTeamId = id;

    if ($('teamName')) $('teamName').value = team.name || '';
    if ($('teamOrg')) $('teamOrg').value = team.organization || '';
    if ($('teamSupervisor')) $('teamSupervisor').value = team.supervisor || '';
    if ($('teamPhone')) $('teamPhone').value = team.phone || '';

    if ($('teamZones')) {
      $('teamZones').value = Array.isArray(team.zones)
        ? team.zones.join(', ')
        : team.zones || '';
    }

    if ($('teamMembers')) {
      $('teamMembers').value = Array.isArray(team.members)
        ? team.members.join(', ')
        : team.members || '';
    }

    if ($('teamShift')) $('teamShift').value = team.shift || '';

    if ($('teamFormTitle')) {
      $('teamFormTitle').textContent = 'Edit Cleanup Team';
    }

    $('teamCard')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  async function saveTeam(event) {
    if (event) event.preventDefault();

    const name = $('teamName')?.value.trim() || '';
    const organization = $('teamOrg')?.value.trim() || '';
    const supervisor = $('teamSupervisor')?.value.trim() || '';
    const phone = $('teamPhone')?.value.trim() || '';
    const zones = parseList($('teamZones')?.value);
    const members = parseList($('teamMembers')?.value);
    const shift = $('teamShift')?.value.trim() || '';

    if (!name) {
      setMessage('Enter the cleanup team name.', true);
      return;
    }

    const body = {
      name,
      organization,
      supervisor,
      phone,
      zones,
      members,
      shift
    };

    const button = document.querySelector(
      '#teamCard button[onclick*="saveTeam"]'
    );

    if (button) {
      button.disabled = true;
      button.dataset.oldText = button.textContent;
      button.textContent = 'Saving...';
    }

    try {
      if (editingTeamId) {
        await request(`/teams/${encodeURIComponent(editingTeamId)}`, {
          method: 'PUT',
          body: JSON.stringify(body)
        });
      } else {
        await request('/teams', {
          method: 'POST',
          body: JSON.stringify(body)
        });
      }

      resetTeamForm();
      await loadTeams();

      if (typeof window.loadReports === 'function') {
        await window.loadReports();
      }

      if (typeof window.loadLogs === 'function') {
        await window.loadLogs();
      }

      setMessage('Cleanup team saved successfully.');
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = button.dataset.oldText || 'Save Team';
      }
    }
  }

  async function deleteTeam(id) {
    const team = teams.find(
      (item) => String(recordId(item)) === String(id)
    );

    if (!team) {
      setMessage('The selected team could not be found.', true);
      return;
    }

    if (!confirm(
      `Delete "${team.name}"? The server will prevent deletion if reports or collection records still depend on this team.`
    )) {
      return;
    }

    try {
      await request(`/teams/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });

      if (String(editingTeamId) === String(id)) {
        resetTeamForm();
      }

      await loadTeams();

      if (typeof window.loadReports === 'function') {
        await window.loadReports();
      }

      if (typeof window.loadLogs === 'function') {
        await window.loadLogs();
      }

      setMessage('Cleanup team deleted successfully.');
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  function initialise() {
    const form = $('teamForm');

    if (form) {
      form.addEventListener('submit', saveTeam);
    }

    const search = $('teamSearch');

    if (search) {
      search.addEventListener('input', () => {
        const query = search.value.trim().toLowerCase();

        const filtered = teams.filter((team) =>
          [
            team.name,
            team.organization,
            team.supervisor,
            team.phone,
            Array.isArray(team.zones) ? team.zones.join(' ') : team.zones
          ].join(' ').toLowerCase().includes(query)
        );

        const original = teams;
        teams = filtered;
        renderTeams();
        teams = original;
      });
    }
  }

  window.loadTeams = loadTeams;
  window.renderTeams = renderTeams;
  window.saveTeam = saveTeam;
  window.editTeam = editTeam;
  window.deleteTeam = deleteTeam;
  window.resetTeamForm = resetTeamForm;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialise);
  } else {
    initialise();
  }
})();
