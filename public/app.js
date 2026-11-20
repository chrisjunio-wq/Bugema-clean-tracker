
// ---------- API and authentication ----------

const originalFetch = window.fetch.bind(window);

window.apiToken = sessionStorage.getItem('bugemaToken') || '';

window.fetch = (url, options = {}) => {
  const headers = new Headers(options.headers || {});

  if (
    window.apiToken &&
    typeof url === 'string' &&
    url.startsWith('/api/')
  ) {
    headers.set('Authorization', 'Bearer ' + window.apiToken);
  }

  return originalFetch(url, {
    ...options,
    headers
  });
};

// Escape values before inserting them into HTML.
function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };

    return entities[character];
  });
}

function statusBadge(status) {
  const label = String(status ?? 'unknown');
  const className = ['open', 'assigned', 'in-progress', 'resolved']
    .includes(label.toLowerCase())
    ? label.toLowerCase()
    : 'unknown';

  return `<span class="status-badge status-${className}">${safeText(label)}</span>`;
}

function showMessage(id, message, color = 'red') {
  const element = document.getElementById(id);

  if (!element) return;

  element.textContent = message;
  element.style.color = color;
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error('The server returned an invalid response.');
  }

  if (!response.ok) {
    throw new Error(
      data.error || 'The request could not be completed.'
    );
  }

  return data;
}

// ---------- Login ----------

async function loginAdmin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  showMessage('loginMessage', '');

  try {
    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    if (
      !data.token ||
      !data.user ||
      data.user.role !== 'admin'
    ) {
      throw new Error('This account is not an administrator.');
    }

    window.apiToken = data.token;
    sessionStorage.setItem('bugemaToken', data.token);

    document.getElementById('adminArea').hidden = false;
    document.getElementById('loginPanel').hidden = true;

    await loadAdminData();

  } catch (error) {
    showMessage('loginMessage', error.message);
  }
}

function logoutAdmin() {
  window.apiToken = '';
  sessionStorage.removeItem('bugemaToken');

  document.getElementById('adminArea').hidden = true;
  document.getElementById('loginPanel').hidden = false;

  const password = document.getElementById('loginPassword');

  if (password) password.value = '';
}

// ---------- Load administrator data ----------

async function loadAdminData() {
  const results = await Promise.allSettled([
    loadDashboard(),
    loadReports(),
    loadLocations(),
    loadTeams(),
    loadReporters(),
    loadLogs(),
    loadLogDropdowns(),
    loadDropdowns()
  ]);

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(
        'Admin data loading failed at task ' + index,
        result.reason
      );
    }
  });
}

// ---------- Navigation ----------

function showPage(name) {
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('show');
  });

  const selectedPage = document.getElementById(name);

  if (selectedPage) {
    selectedPage.classList.add('show');
  }

  document.querySelectorAll('#nav a').forEach(link => {
    link.classList.toggle(
      'active',
      link.dataset.page === name
    );
  });

  if (name === 'dashboard') loadDashboard();
  if (name === 'reports') loadReports();
  if (name === 'locations') loadLocations();
  if (name === 'teams') loadTeams();
  if (name === 'reporters') loadReporters();

  if (name === 'logs') {
    loadLogs();
    loadLogDropdowns();
  }
}

document.querySelectorAll('#nav a').forEach(link => {
  link.addEventListener('click', event => {
    event.preventDefault();
    showPage(link.dataset.page);
  });
});

// ---------- Dashboard ----------

async function loadDashboard() {
  try {
    const summary = await apiRequest('/api/stats/summary');

    document.getElementById('sTotal').textContent =
      summary.totalReports ?? 0;

    document.getElementById('sOpen').textContent =
      summary.openReports ?? 0;

    document.getElementById('sUrgent').textContent =
      summary.urgentUnresolved ?? 0;

    document.getElementById('sMissed').textContent =
      summary.missedCollections ?? 0;

    const areaData = await apiRequest('/api/stats/by-area');

    document.getElementById('areaRows').innerHTML =
      areaData.map(item => `
        <tr>
          <td>${safeText(item._id || 'Unknown')}</td>
          <td>${safeText(item.count)}</td>
        </tr>
      `).join('');

    const statuses = await apiRequest('/api/stats/by-status');

    document.getElementById('statusRows').innerHTML =
      statuses.map(item => `
        <tr>
          <td>${statusBadge(item._id || 'Unknown')}</td>
          <td>${safeText(item.count)}</td>
        </tr>
      `).join('');

    const locations = await apiRequest('/api/stats/by-location');

    document.getElementById('locRows').innerHTML =
      locations.map(item => `
        <tr>
          <td>${safeText(item.locationName || 'Unknown location')}</td>
          <td>${safeText(item.area || 'Unknown area')}</td>
          <td>${safeText(item.count)}</td>
        </tr>
      `).join('');

  } catch (error) {
    console.error('Dashboard error:', error);
  }
}

// ---------- Reports ----------

let reportsCache = [];
let editingId = null;
let editTrigger = null;

async function loadDropdowns() {
  try {
    const locations = await apiRequest('/api/locations');
    const teams = await apiRequest('/api/teams');

    const locationSelect = document.getElementById('locationId');
    const teamSelect = document.getElementById('editTeam');

    if (locationSelect) {
      locationSelect.innerHTML =
        '<option value="">Select location</option>' +
        locations.map(location => `
          <option value="${safeText(location._id)}">
            ${safeText(location.name)} (${safeText(location.area)})
          </option>
        `).join('');
    }

    if (teamSelect) {
      teamSelect.innerHTML =
        '<option value="">-- none --</option>' +
        teams.map(team => `
          <option value="${safeText(team._id)}">
            ${safeText(team.name)}
          </option>
        `).join('');
    }

  } catch (error) {
    console.error('Dropdown loading error:', error);
  }
}

async function loadReports() {
  try {
    const area = document.getElementById('areaFilter')?.value || '';
    const status = document.getElementById('statusFilter')?.value || '';

    const params = new URLSearchParams();

    if (area) params.set('area', area);
    if (status) params.set('status', status);

    reportsCache = await apiRequest(
      '/api/reports?' + params.toString()
    );

    const rows = document.getElementById('reportRows');

    if (!rows) return;

    rows.innerHTML = reportsCache.map(report => `
      <tr>
        <td>${safeText(report._id)}</td>
        <td>
          <strong>${safeText(report.locationName || 'Unknown location')}</strong>
          ${report.locationDetails
            ? `<small class="report-location-detail">${safeText(report.locationDetails)}</small>`
            : ''}
        </td>
        <td>${safeText(report.area)}</td>
        <td>${safeText(report.issueType)}</td>
        <td>
          <span class="${safeText(report.urgency)}">
            ${safeText(report.urgency)}
          </span>
        </td>
        <td>${statusBadge(report.status)}</td>
        <td>${safeText(report.teamName || '-')}</td>
        <td>
          <button class="small edit"
            onclick="openEdit('${safeText(report._id)}')">
            Edit
          </button>
          <button class="small del"
            onclick="deleteReport('${safeText(report._id)}')">
            Delete
          </button>
        </td>
      </tr>
    `).join('');

  } catch (error) {
    console.error('Reports loading error:', error);
  }
}

// ---------- Edit reports ----------

function openEdit(id) {
  const report = reportsCache.find(item => item._id === id);

  if (!report) {
    alert('Report could not be found.');
    return;
  }

  editingId = id;

  document.getElementById('editId').textContent = id;
  document.getElementById('editStatus').value = report.status;
  document.getElementById('editUrgency').value = report.urgency;
  document.getElementById('editTeam').value =
    report.assignedTeamId || '';

  editTrigger = document.activeElement;
  document.getElementById('editBackdrop').hidden = false;
  document.getElementById('editCard').style.display = 'block';
  document.getElementById('editStatus').focus();
}

function closeEdit() {
  document.getElementById('editCard').style.display = 'none';
  document.getElementById('editBackdrop').hidden = true;
  editingId = null;
  if (editTrigger && typeof editTrigger.focus === 'function') {
    editTrigger.focus();
  }
  editTrigger = null;
}

let collectionFormTrigger = null;

function openCollectionForm(cardId, focusId) {
  collectionFormTrigger = document.activeElement;
  document.getElementById('editBackdrop').hidden = false;
  document.getElementById(cardId).hidden = false;
  document.getElementById(focusId).focus();
}

function closeCollectionForm(cardId) {
  const formCard = document.getElementById(cardId);
  if (!formCard || formCard.hidden) return;

  formCard.hidden = true;
  document.getElementById('editBackdrop').hidden = true;
  if (collectionFormTrigger && typeof collectionFormTrigger.focus === 'function') {
    collectionFormTrigger.focus();
  }
  collectionFormTrigger = null;
}

document.getElementById('editBackdrop').addEventListener('click', () => {
  const openCollectionCard = document.querySelector('.collection-modal:not([hidden])');
  if (openCollectionCard) {
    closeCollectionForm(openCollectionCard.id);
  } else {
    closeEdit();
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    const openCollectionCard = document.querySelector('.collection-modal:not([hidden])');
    if (openCollectionCard) {
      closeCollectionForm(openCollectionCard.id);
    } else if (document.getElementById('editCard').style.display === 'block') {
      closeEdit();
    }
  }
});

async function saveEdit() {
  if (!editingId) return;

  const body = {
    status: document.getElementById('editStatus').value,
    urgency: document.getElementById('editUrgency').value,
    assignedTeamId: document.getElementById('editTeam').value
  };

  try {
    await apiRequest(
      '/api/reports/' + encodeURIComponent(editingId),
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    closeEdit();
    await loadReports();

  } catch (error) {
    alert('Error: ' + error.message);
  }
}

async function deleteReport(id) {
  if (!confirm('Delete report ' + id + '?')) return;

  try {
    await apiRequest(
      '/api/reports/' + encodeURIComponent(id),
      { method: 'DELETE' }
    );

    await loadReports();

  } catch (error) {
    alert('Error: ' + error.message);
  }
}

// ---------- Restore administrator session ----------

async function restoreAdminSession() {
  if (!window.apiToken) return;

  try {
    const user = await apiRequest('/api/auth/me');

    if (!user || user.role !== 'admin') {
      throw new Error('This account is not an administrator.');
    }

    document.getElementById('adminArea').hidden = false;
    document.getElementById('loginPanel').hidden = true;

    await loadAdminData();

  } catch (error) {
    logoutAdmin();
  }
}

restoreAdminSession();
