
'use strict';

/* =========================================================
   BUGEMA CLEAN COMMUNITY TRACKER
   Location management
   ========================================================= */

(() => {
  const $ = (id) => document.getElementById(id);

  let locations = [];
  let editingLocationId = null;

  function escapeHtml(value) {
    if (typeof window.escapeHtml === 'function') {
      return window.escapeHtml(value);
    }

    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[character]);
  }

  async function request(endpoint, options = {}) {
    if (typeof window.apiRequest === 'function') {
      return window.apiRequest(endpoint, options);
    }

    throw new Error('The main application API client is unavailable.');
  }

  function recordId(record) {
    return record?._id ?? record?.id ?? '';
  }

  function setMessage(message, isError = false) {
    const element = $('locMessage') || $('locationMessage');

    if (!element) return;

    element.textContent = message;
    element.style.color = isError ? '#b42318' : '#267344';
  }

  function getRowsContainer() {
    const table = $('locRowsTable');
    if (!table) return null;

    return table.querySelector('tbody') || table;
  }

  function renderLocations() {
    const body = getRowsContainer();
    if (!body) return;

    if (!locations.length) {
      body.innerHTML = `
        <tr>
          <td colspan="6">No locations have been added.</td>
        </tr>
      `;
      return;
    }

    body.innerHTML = locations.map((location) => {
      const id = recordId(location);

      return `
        <tr>
          <td>${escapeHtml(location.name || '—')}</td>
          <td>${escapeHtml(location.zone || '—')}</td>
          <td>${escapeHtml(location.area || '—')}</td>
          <td>${escapeHtml(location.binCount ?? location.bins ?? 0)}</td>
          <td>${escapeHtml(location.createdAt ? new Date(location.createdAt).toLocaleDateString() : '—')}</td>
          <td>
            <button type="button" onclick="editLocation('${escapeHtml(id)}')">
              Edit
            </button>
            <button type="button" onclick="deleteLocation('${escapeHtml(id)}')">
              Delete
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function updateLocationDropdowns() {
    const dropdownIds = [
      'reportLocation',
      'logLocation',
      'locationFilter'
    ];

    dropdownIds.forEach((id) => {
      const select = $(id);
      if (!select) return;

      const previousValue = select.value;
      const firstOption = select.options[0];

      const placeholder = firstOption
        ? firstOption.textContent
        : 'Select location';

      select.innerHTML = '';

      select.add(new Option(placeholder, ''));

      locations.forEach((location) => {
        const idValue = recordId(location);

        const option = new Option(
          `${location.name || 'Unnamed location'}${location.area ? ` — ${location.area}` : ''}`,
          idValue
        );

        select.add(option);
      });

      if (locations.some((location) => String(recordId(location)) === previousValue)) {
        select.value = previousValue;
      }
    });
  }

  async function loadLocations() {
    try {
      const result = await request('/locations');

      locations = Array.isArray(result)
        ? result
        : result.locations || result.data || [];

      renderLocations();
      updateLocationDropdowns();

      setMessage(`${locations.length} location(s) loaded.`);

      return locations;
    } catch (error) {
      setMessage(error.message, true);
      console.error('Location loading failed:', error);
      throw error;
    }
  }

  function resetLocationForm() {
    editingLocationId = null;

    $('locName') && ($('locName').value = '');
    $('locZone') && ($('locZone').value = '');
    $('locArea') && ($('locArea').value = '');
    $('locBins') && ($('locBins').value = '');

    if ($('locFormTitle')) {
      $('locFormTitle').textContent = 'Add Location';
    }

    setMessage('');
  }

  function editLocation(id) {
    const location = locations.find(
      (item) => String(recordId(item)) === String(id)
    );

    if (!location) {
      setMessage('The selected location could not be found.', true);
      return;
    }

    editingLocationId = id;

    if ($('locName')) $('locName').value = location.name || '';
    if ($('locZone')) $('locZone').value = location.zone || '';
    if ($('locArea')) $('locArea').value = location.area || '';

    if ($('locBins')) {
      $('locBins').value = location.binCount ?? location.bins ?? 0;
    }

    if ($('locFormTitle')) {
      $('locFormTitle').textContent = 'Edit Location';
    }

    $('locCard')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  async function saveLocation(event) {
    if (event) event.preventDefault();

    const name = $('locName')?.value.trim() || '';
    const zone = $('locZone')?.value.trim() || '';
    const area = $('locArea')?.value.trim() || '';
    const binCount = Number($('locBins')?.value || 0);

    if (!name || !zone || !area) {
      setMessage('Enter the location name, zone and area.', true);
      return;
    }

    if (!Number.isInteger(binCount) || binCount < 0) {
      setMessage('Bin count must be a whole number of zero or more.', true);
      return;
    }

    const body = {
      name,
      zone,
      area,
      binCount
    };

    const button = document.querySelector(
      '#locCard button[onclick*="saveLocation"]'
    );

    if (button) {
      button.disabled = true;
      button.dataset.oldText = button.textContent;
      button.textContent = 'Saving...';
    }

    try {
      if (editingLocationId) {
        await request(`/locations/${encodeURIComponent(editingLocationId)}`, {
          method: 'PUT',
          body: JSON.stringify(body)
        });
      } else {
        await request('/locations', {
          method: 'POST',
          body: JSON.stringify(body)
        });
      }

      resetLocationForm();

      await loadLocations();

      if (typeof window.loadReports === 'function') {
        await window.loadReports();
      }

      if (typeof window.loadDashboard === 'function') {
        await window.loadDashboard();
      }

      setMessage('Location saved successfully.');
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = button.dataset.oldText || 'Save Location';
      }
    }
  }

  async function deleteLocation(id) {
    const location = locations.find(
      (item) => String(recordId(item)) === String(id)
    );

    if (!location) {
      setMessage('The selected location could not be found.', true);
      return;
    }

    if (!confirm(
      `Delete "${location.name}"? The server will prevent deletion if records still depend on this location.`
    )) {
      return;
    }

    try {
      await request(`/locations/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });

      if (String(editingLocationId) === String(id)) {
        resetLocationForm();
      }

      await loadLocations();

      if (typeof window.loadReports === 'function') {
        await window.loadReports();
      }

      if (typeof window.loadDashboard === 'function') {
        await window.loadDashboard();
      }

      setMessage('Location deleted successfully.');
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  function initialise() {
    const form = $('locationForm') || $('locForm');

    if (form) {
      form.addEventListener('submit', saveLocation);
    }

    const search = $('locationSearch');

    if (search) {
      search.addEventListener('input', () => {
        const query = search.value.trim().toLowerCase();

        const filtered = locations.filter((location) =>
          [
            location.name,
            location.zone,
            location.area
          ].join(' ').toLowerCase().includes(query)
        );

        const original = locations;
        locations = filtered;
        renderLocations();
        locations = original;
      });
    }
  }

  window.loadLocations = loadLocations;
  window.renderLocations = renderLocations;
  window.saveLocation = saveLocation;
  window.editLocation = editLocation;
  window.deleteLocation = deleteLocation;
  window.resetLocationForm = resetLocationForm;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialise);
  } else {
    initialise();
  }
})();
