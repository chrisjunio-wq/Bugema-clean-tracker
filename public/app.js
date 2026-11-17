
'use strict';

(() => {
  const API = '/api';
  const TOKEN_KEY = 'bugema_admin_token';
  const USER_KEY = 'bugema_admin_user';

  const $ = id => document.getElementById(id);

  let token = localStorage.getItem(TOKEN_KEY) || '';
  let currentUser = null;
  let reports = [];
  let locations = [];
  let teams = [];
  let reporters = [];
  let editingReportId = null;
  let editingLocationId = null;
  let editingTeamId = null;
  let editingReporterId = null;
  let editingLogId = null;

  const STATUSES = [
    'open',
    'under-review',
    'assigned',
    'in-progress',
    'resolved',
    'rejected'
  ];

  const CLOSED_STATUSES = ['resolved', 'rejected'];

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  function showMessage(elementId, message, type = 'error') {
    const element = $(elementId);
    if (!element) return;

    element.textContent = message;
    element.className = `message ${type}`;
    element.hidden = !message;
  }

  async function api(url, options = {}) {
    const headers = {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    const response = await fetch(`${API}${url}`, {
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      clearSession();
      showLogin();
    }

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Request failed.');
    }

    return data;
  }

  function saveSession(newToken, user) {
    token = newToken;
    currentUser = user;

    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    token = '';
    currentUser = null;

    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function showLogin() {
    if ($('loginPanel')) $('loginPanel').hidden = false;
    if ($('adminArea')) $('adminArea').hidden = true;
  }

  function showAdmin() {
    if ($('loginPanel')) $('loginPanel').hidden = true;
    if ($('adminArea')) $('adminArea').hidden = false;
  }

  window.loginAdmin = async function loginAdmin(event) {
    if (event) event.preventDefault();

    const email = $('loginEmail')?.value.trim() || '';
    const password = $('loginPassword')?.value || '';

    if (!email || !password) {
      showMessage('loginMessage', 'Enter your email and password.');
      return;
    }

    try {
      const result = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      if (!result.token || !result.user || result.user.role !== 'admin') {
        throw new Error('Administrator access is required.');
      }

      saveSession(result.token, result.user);
      showMessage('loginMessage', '');
      showAdmin();
      await loadAdminData();
    } catch (error) {
      showMessage('loginMessage', error.message);
    }
  };

  window.logoutAdmin = function logoutAdmin() {
    clearSession();
    showLogin();
  };

  async function restoreAdminSession() {
    if (!token) {
      showLogin();
      return;
    }

    try {
      const result = await api('/auth/me');

      currentUser = result.user || result;

      if (currentUser.role !== 'admin') {
        throw new Error('Administrator access is required.');
      }

      localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
      showAdmin();
      await loadAdminData();
    } catch {
      clearSession();
      showLogin();
    }
  }

  function formatDate(value) {
    if (!value) return '—';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';

    return date.toLocaleDateString();
  }

  function statusLabel(status) {
    return String(status || 'open')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, letter => letter.toUpperCase());
  }

  function fillSelect(elementId, records, placeholder, valueKey = '_id', labelKey = 'name') {
    const select = $(elementId);
    if (!select) return;

    const oldValue = select.value;

    select.innerHTML = '';

    const first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder;
    select.appendChild(first);

    records.forEach(record => {
      const option = document.createElement('option');
      option.value = record[valueKey] ?? '';
      option.textContent = record[labelKey] ?? '';
      select.appendChild(option);
    });

    if (oldValue) select.value = oldValue;
  }

  function showPage(page) {
    const pageNames = [
      'dashboard',
      'reports',
      'locations',
      'teams',
      'reporters',
      'logs'
    ];

    pageNames.forEach(name => {
      const section = $(`${name}Page`) ||
        document.querySelector(`[data-page="${name}"]`);

      if (section) section.hidden = name !== page;
    });

    document.querySelectorAll('[data-nav]').forEach(button => {
      button.classList.toggle(
        'active',
        button.dataset.nav === page
      );
    });

    if (page === 'dashboard') loadDashboard();
    if (page === 'reports') loadReports();
    if (page === 'locations') window.loadLocations?.();
    if (page === 'teams') window.loadTeams?.();
    if (page === 'reporters') window.loadReporters?.();
    if (page === 'logs') window.loadLogs?.();
  }

  function setupNavigation() {
    document.querySelectorAll('[data-nav]').forEach(button => {
      button.addEventListener('click', () => {
        showPage(button.dataset.nav);
      });
    });

    [
      'dashboard',
      'reports',
      'locations',
      'teams',
      'reporters',
      'logs'
    ].forEach(name => {
      const button = $(name);
      if (button && !button.dataset.nav) {
        button.addEventListener('click', () => showPage(name));
      }
    });
  }

  async function loadAdminData() {
    try {
      await Promise.all([
        loadLocations(),
        loadTeams(),
        loadReporters(),
        loadReports(),
        loadDashboard()
      ]);

      window.loadLogs?.();
    } catch (error) {
      console.error('Unable to load administrator data:', error);
    }
  }

  async function loadLocations() {
    locations = await api('/locations');
    fillSelect('reportLocation', locations, 'Select location');
    fillSelect('logLocation', locations, 'Select location');
    fillSelect('locationFilter', locations, 'All locations');
  }

  async function loadTeams() {
    teams = await api('/teams');
    fillSelect('editTeam', teams, 'Unassigned');
    fillSelect('logTeam', teams, 'Select team');
    fillSelect('teamFilter', teams, 'All teams');
  }

  async function loadReporters() {
    reporters = await api('/reporters');
    fillSelect('reportReporter', reporters, 'Select reporter');
  }

  async function loadDashboard() {
    try {
      const [summary, statuses, locationData, areaData] = await Promise.all([
        api('/stats/summary'),
        api('/stats/by-status'),
        api('/stats/by-location'),
        api('/stats/by-area')
      ]);

      const data = summary.summary || summary;

      setText('sTotal', data.totalReports ?? 0);
      setText('sOpen', data.openReports ?? 0);
      setText('sUrgent', data.urgentReports ?? 0);
      setText('sMissed', data.missedReports ?? 0);
      setText('sOverdue', data.overdueReports ?? 0);
      setText('sResolvedRate', `${data.resolvedRate ?? 0}%`);

      renderSimpleTable(
        ['Status', 'Reports'],
        (statuses.data || []).map(item => [
          statusLabel(item.status),
          item.count
        ]),
        ['statusTable', 'statusRows', 'statusBreakdown']
      );

      renderSimpleTable(
        ['Location', 'Reports'],
        (locationData.data || []).map(item => [
          item.location,
          item.count
        ]),
        ['locationTable', 'locationRows', 'locationBreakdown']
      );

      renderSimpleTable(
        ['Area', 'Reports'],
        (areaData.data || []).map(item => [
          item.area,
          item.count
        ]),
        ['areaTable', 'areaRows', 'areaBreakdown']
      );
    } catch (error) {
      console.error('Dashboard error:', error);
    }
  }

  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
  }

  function renderSimpleTable(headers, rows, possibleIds) {
    const table = possibleIds
      .map(id => $(id))
      .find(Boolean);

    if (!table) return;

    const body = table.tagName === 'TBODY'
      ? table
      : table.querySelector('tbody');

    if (!body) return;

    body.innerHTML = rows.length
      ? rows.map(row => `
          <tr>
            ${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}
          </tr>
        `).join('')
      : `<tr><td colspan="${headers.length}">No records found.</td></tr>`;
  }

  async function loadReports() {
    try {
      reports = await api('/reports');
      renderReports();
    } catch (error) {
      showMessage('reportLoadMessage', error.message);
    }
  }

  function renderReports() {
    const body = $('reportRows');
    if (!body) return;

    body.innerHTML = reports.length
      ? reports.map(report => `
          <tr>
            <td>${escapeHtml(report.reportNumber || report._id)}</td>
            <td>${escapeHtml(report.reporterName || '—')}</td>
            <td>${escapeHtml(report.issueType || '—')}</td>
            <td>${escapeHtml(report.locationName || report.locationDetails || '—')}</td>
            <td>${escapeHtml(statusLabel(report.status))}</td>
            <td>${escapeHtml(report.urgency || '—')}</td>
            <td>${escapeHtml(formatDate(report.createdAt))}</td>
            <td>
              <button type="button" data-edit-report="${escapeHtml(report._id)}">Edit</button>
              <button type="button" data-delete-report="${escapeHtml(report._id)}">Delete</button>
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="8">No reports found.</td></tr>';

    body.querySelectorAll('[data-edit-report]').forEach(button => {
      button.addEventListener('click', () => {
        editReport(button.dataset.editReport);
      });
    });

    body.querySelectorAll('[data-delete-report]').forEach(button => {
      button.addEventListener('click', () => {
        deleteReport(button.dataset.deleteReport);
      });
    });
  }

  function editReport(id) {
    const report = reports.find(item => item._id === id);
    if (!report) return;

    editingReportId = id;

    setText('reportFormTitle', 'Edit Report');

    if ($('reportLocation')) {
      $('reportLocation').value = report.locationId || '';
    }

    if ($('reportReporter')) {
      $('reportReporter').value = report.reporterId || '';
    }

    if ($('reportIssueType')) {
      $('reportIssueType').value = report.issueType || '';
    }

    if ($('reportUrgency')) {
      $('reportUrgency').value = report.urgency || 'medium';
    }

    if ($('reportDescription')) {
      $('reportDescription').value = report.description || '';
    }

    if ($('editStatus')) $('editStatus').value = report.status || 'open';

    if ($('editUrgency')) $('editUrgency').value = report.urgency || 'medium';

    if ($('editTeam')) {
      $('editTeam').value = report.assignedTeam?._id ||
        report.assignedTeam?.id ||
        report.assignedTeam ||
        '';
    }

    $('reportCard')?.scrollIntoView({ behavior: 'smooth' });
  }

  async function saveReport(event) {
    if (event) event.preventDefault();

    const payload = {
      locationId: $('reportLocation')?.value || '',
      reporterId: $('reportReporter')?.value || '',
      issueType: $('reportIssueType')?.value || '',
      urgency: $('editUrgency')?.value ||
        $('reportUrgency')?.value ||
        'medium',
      description: $('reportDescription')?.value.trim() || '',
      status: $('editStatus')?.value || 'open',
      assignedTeam: $('editTeam')?.value || null
    };

    try {
      if (editingReportId) {
        await api(`/reports/${encodeURIComponent(editingReportId)}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await api('/admin/reports', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      resetReportForm();
      await loadReports();
      await loadDashboard();
      showMessage('reportLoadMessage', 'Report saved successfully.', 'success');
    } catch (error) {
      showMessage('reportLoadMessage', error.message);
    }
  }

  function resetReportForm() {
    editingReportId = null;

    $('reportForm')?.reset();

    if ($('reportFormTitle')) {
      $('reportFormTitle').textContent = 'Create Report';
    }

    if ($('editStatus')) $('editStatus').value = 'open';
    if ($('editUrgency')) $('editUrgency').value = 'medium';
    if ($('editTeam')) $('editTeam').value = '';

    showMessage('reportLoadMessage', '');
  }

  async function deleteReport(id) {
    if (!confirm('Delete this report permanently?')) return;

    try {
      await api(`/reports/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });

      await loadReports();
      await loadDashboard();
    } catch (error) {
      showMessage('reportLoadMessage', error.message);
    }
  }

  function setupReportForm() {
    const form = $('reportForm');

    if (form) {
      form.addEventListener('submit', saveReport);
    }

    $('saveReport')?.addEventListener('click', saveReport);
    $('resetReport')?.addEventListener('click', resetReportForm);
  }

  function setupStatusOptions() {
    const select = $('editStatus');
    if (!select) return;

    const current = select.value;

    select.innerHTML = STATUSES.map(status => `
      <option value="${status}">${statusLabel(status)}</option>
    `).join('');

    select.value = current || 'open';
  }

  function setupForms() {
    setupNavigation();
    setupReportForm();
    setupStatusOptions();

    $('logoutButton')?.addEventListener('click', window.logoutAdmin);

    const loginForm = $('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', window.loginAdmin);
    }

    document.querySelectorAll('[data-logout]').forEach(button => {
      button.addEventListener('click', window.logoutAdmin);
    });
  }

  window.loadLocations = loadLocations;
  window.loadTeams = loadTeams;
  window.loadReporters = loadReporters;
  window.loadReports = loadReports;
  window.loadDashboard = loadDashboard;
  window.showAdminPage = showPage;
  window.resetReportForm = resetReportForm;

  document.addEventListener('DOMContentLoaded', () => {
    setupForms();
    restoreAdminSession();
  });
})();
