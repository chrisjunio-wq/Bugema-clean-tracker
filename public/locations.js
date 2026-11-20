
let locEditing = null;

function openAddLocation() {
  resetLocationForm();
  openCollectionForm('locFormCard', 'locName');
}

async function loadLocations() {
  try {
    const area = document.getElementById('locAreaFilter')?.value || '';
    const params = new URLSearchParams();

    if (area) params.set('area', area);

    const data = await apiRequest('/api/locations?' + params.toString());

    document.getElementById('locRowsTable').innerHTML = data.map(location => `
      <tr>
        <td>${safeText(location._id)}</td>
        <td>${safeText(location.name)}</td>
        <td>${safeText(location.zone)}</td>
        <td>${safeText(location.area)}</td>
        <td>${safeText(location.binCount ?? '')}</td>
        <td>
          <button class="small edit"
            onclick="editLocation('${safeText(location._id)}')">Edit</button>
          <button class="small del"
            onclick="deleteLocation('${safeText(location._id)}')">Delete</button>
        </td>
      </tr>
    `).join('');

  } catch (error) {
    console.error('Loading locations failed:', error);
  }
}

async function editLocation(id) {
  try {
    const location = await apiRequest(
      '/api/locations/' + encodeURIComponent(id)
    );

    locEditing = id;

    document.getElementById('locFormTitle').textContent =
      'Edit Location ' + id;

    document.getElementById('locName').value = location.name || '';
    document.getElementById('locZone').value = location.zone || '';
    document.getElementById('locArea').value = location.area || '';
    document.getElementById('locBins').value = location.binCount ?? 0;

    openCollectionForm('locFormCard', 'locName');

  } catch (error) {
    alert('Could not load location: ' + error.message);
  }
}

function resetLocationForm() {
  closeCollectionForm('locFormCard');
  locEditing = null;

  document.getElementById('locFormTitle').textContent = 'Add a Location';
  document.getElementById('locName').value = '';
  document.getElementById('locZone').value = '';
  document.getElementById('locArea').value = 'Campus';
  document.getElementById('locBins').value = '';
}

async function saveLocation() {
  const body = {
    name: document.getElementById('locName').value.trim(),
    zone: document.getElementById('locZone').value.trim(),
    area: document.getElementById('locArea').value,
    binCount: Number(document.getElementById('locBins').value)
  };

  if (!body.name || !body.zone || !body.area) {
    alert('Please complete the location name, zone and area.');
    return;
  }

  if (!Number.isInteger(body.binCount) || body.binCount < 0) {
    alert('Bin count must be a non-negative whole number.');
    return;
  }

  const url = locEditing
    ? '/api/locations/' + encodeURIComponent(locEditing)
    : '/api/locations';

  try {
    await apiRequest(url, {
      method: locEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    resetLocationForm();
    await loadLocations();
    await loadDropdowns();

    alert('Location saved successfully.');

  } catch (error) {
    alert('Error: ' + error.message);
  }
}

async function deleteLocation(id) {
  if (!confirm('Delete location ' + id + '?')) return;

  try {
    await apiRequest(
      '/api/locations/' + encodeURIComponent(id),
      { method: 'DELETE' }
    );

    await loadLocations();
    await loadDropdowns();

    alert('Location deleted successfully.');

  } catch (error) {
    alert('Error: ' + error.message);
  }
}
