
'use strict';

/* =========================================================
   BUGEMA CLEAN COMMUNITY TRACKER
   Reporter management
   ========================================================= */

(() => {
  const $ = (id) => document.getElementById(id);

  let reporters = [];
  let editingReporterId = null;

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
    const element = $('repMessage') || $('reporterMessage');

    if (!element) return;

    element.textContent = message;
    element.style.color = isError ? '#b42318' : '#267344';
  }

  function rowsContainer() {
    const table = $('repRowsTable');
    return table ? table.querySelector('tbody') || table : null;
  }

  function renderReporters() {
    const body = rowsContainer();
    if (!body) return;

    if (!reporters.length) {
      body.innerHTML = `
        <tr>
          <td colspan="6">No reporters have been registered.</td>
        </tr>
      `;
      updateReporterDropdowns();
      return;
    }

    body.innerHTML = reporters.map((reporter) => {
      const id = recordId(reporter);

      return `
        <tr>
          <td>${escapeHtml(reporter.name || '—')}</td>
          <td>${escapeHtml(reporter.role || '—')}</td>
          <td>${escapeHtml(reporter.affiliation || '—')}</td>
          <td>${escapeHtml(reporter.phone || '—')}</td>
          <td>${escapeHtml(reporter.createdAt ? new Date(reporter.createdAt).toLocaleDateString() : '—')}</td>
          <td>
            <button type="button" onclick="editReporter('${escapeHtml(id)}')">
              Edit
            </button>
            <button type="button" onclick="deleteReporter('${escapeHtml(id)}')">
              Delete
            </button>
          </td>
        </tr>
      `;
    }).join('');

    updateReporterDropdowns();
  }

  function updateReporterDropdowns() {
    const dropdownIds = [
      'reportReporter',
      'reporterFilter'
    ];

    dropdownIds.forEach((id) => {
      const select = $(id);
      if (!select) return;

      const previousValue = select.value;
      const placeholder = select.options[0]?.textContent || 'Select reporter';

      select.innerHTML = '';
      select.add(new Option(placeholder, ''));

      reporters.forEach((reporter) => {
        select.add(new Option(
          reporter.name || 'Unnamed reporter',
          recordId(reporter)
        ));
      });

      if (reporters.some((reporter) => String(recordId(reporter)) === previousValue)) {
        select.value = previousValue;
      }
    });
  }

  async function loadReporters() {
    try {
      const result = await request('/reporters');

      reporters = Array.isArray(result)
        ? result
        : result.reporters || result.data || [];

      renderReporters();
      setMessage(`${reporters.length} reporter(s) loaded.`);

      return reporters;
    } catch (error) {
      setMessage(error.message, true);
      console.error('Reporter loading failed:', error);
      throw error;
    }
  }

  function resetReporterForm() {
    editingReporterId = null;

    [
      'repName',
      'repRole',
      'repAff',
      'repPhone'
    ].forEach((id) => {
      if ($(id)) $(id).value = '';
    });

    if ($('repFormTitle')) {
      $('repFormTitle').textContent = 'Add Reporter';
    }

    setMessage('');
  }

  function editReporter(id) {
    const reporter = reporters.find(
      (item) => String(recordId(item)) === String(id)
    );

    if (!reporter) {
      setMessage('The selected reporter could not be found.', true);
      return;
    }

    editingReporterId = id;

    if ($('repName')) $('repName').value = reporter.name || '';
    if ($('repRole')) $('repRole').value = reporter.role || '';
    if ($('repAff')) $('repAff').value = reporter.affiliation || '';
    if ($('repPhone')) $('repPhone').value = reporter.phone || '';

    if ($('repFormTitle')) {
      $('repFormTitle').textContent = 'Edit Reporter';
    }

    $('repCard')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  async function saveReporter(event) {
    if (event) event.preventDefault();

    const name = $('repName')?.value.trim() || '';
    const role = $('repRole')?.value.trim() || '';
    const affiliation = $('repAff')?.value.trim() || '';
    const phone = $('repPhone')?.value.trim() || '';

    if (!name) {
      setMessage('Enter the reporter name.', true);
      return;
    }

    const body = {
      name,
      role,
      affiliation,
      phone
    };

    const button = document.querySelector(
      '#repCard button[onclick*="saveReporter"]'
    );

    if (button) {
      button.disabled = true;
      button.dataset.oldText = button.textContent;
      button.textContent = 'Saving...';
    }

    try {
      if (editingReporterId) {
        await request(`/reporters/${encodeURIComponent(editingReporterId)}`, {
          method: 'PUT',
          body: JSON.stringify(body)
        });
      } else {
        await request('/reporters', {
          method: 'POST',
          body: JSON.stringify(body)
        });
      }

      resetReporterForm();
      await loadReporters();

      if (typeof window.loadReports === 'function') {
        await window.loadReports();
      }

      setMessage('Reporter saved successfully.');
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = button.dataset.oldText || 'Save Reporter';
      }
    }
  }

  async function deleteReporter(id) {
    const reporter = reporters.find(
      (item) => String(recordId(item)) === String(id)
    );

    if (!reporter) {
      setMessage('The selected reporter could not be found.', true);
      return;
    }

    if (!confirm(
      `Delete reporter "${reporter.name}"? The server will prevent deletion if existing reports still depend on this reporter.`
    )) {
      return;
    }

    try {
      await request(`/reporters/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });

      if (String(editingReporterId) === String(id)) {
        resetReporterForm();
      }

      await loadReporters();

      if (typeof window.loadReports === 'function') {
        await window.loadReports();
      }

      setMessage('Reporter deleted successfully.');
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  function initialise() {
    const form = $('reporterForm') || $('repForm');

    if (form) {
      form.addEventListener('submit', saveReporter);
    }

    const search = $('reporterSearch');

    if (search) {
      search.addEventListener('input', () => {
        const query = search.value.trim().toLowerCase();

        const filtered = reporters.filter((reporter) =>
          [
            reporter.name,
            reporter.role,
            reporter.affiliation,
            reporter.phone
          ].join(' ').toLowerCase().includes(query)
        );

        const original = reporters;
        reporters = filtered;
        renderReporters();
        reporters = original;
      });
    }
  }

  window.loadReporters = loadReporters;
  window.renderReporters = renderReporters;
  window.saveReporter = saveReporter;
  window.editReporter = editReporter;
  window.deleteReporter = deleteReporter;
  window.resetReporterForm = resetReporterForm;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialise);
  } else {
    initialise();
  }
})();
