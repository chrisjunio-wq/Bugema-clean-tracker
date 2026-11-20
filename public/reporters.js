
let repEditing = null;

function openAddReporter() {
  resetReporterForm();
  openCollectionForm('repFormCard', 'repName');
}

async function loadReporters() {
  try {
    const affiliation =
      document.getElementById('repAffFilter')?.value || '';

    const params = new URLSearchParams();

    if (affiliation) {
      params.set('affiliation', affiliation);
    }

    const data = await apiRequest('/api/reporters?' + params.toString());

    document.getElementById('repRowsTable').innerHTML = data.map(reporter => `
      <tr>
        <td>${safeText(reporter._id)}</td>
        <td>${safeText(reporter.name)}</td>
        <td>${safeText(reporter.role)}</td>
        <td>${safeText(reporter.affiliation)}</td>
        <td>${safeText(reporter.phone || '')}</td>
        <td>
          <button class="small edit"
            onclick="editReporter('${safeText(reporter._id)}')">Edit</button>
          <button class="small del"
            onclick="deleteReporter('${safeText(reporter._id)}')">Delete</button>
        </td>
      </tr>
    `).join('');

  } catch (error) {
    console.error('Loading reporters failed:', error);
  }
}

async function editReporter(id) {
  try {
    const reporter = await apiRequest(
      '/api/reporters/' + encodeURIComponent(id)
    );

    repEditing = id;

    document.getElementById('repFormTitle').textContent =
      'Edit Reporter ' + id;

    document.getElementById('repName').value = reporter.name || '';
    document.getElementById('repRole').value = reporter.role || '';
    document.getElementById('repAff').value = reporter.affiliation || '';
    document.getElementById('repPhone').value = reporter.phone || '';

    openCollectionForm('repFormCard', 'repName');

  } catch (error) {
    alert('Could not load reporter: ' + error.message);
  }
}

function resetReporterForm() {
  closeCollectionForm('repFormCard');
  repEditing = null;

  document.getElementById('repFormTitle').textContent =
    'Add a Reporter';

  [
    'repName',
    'repRole',
    'repPhone'
  ].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('repAff').value = 'Campus';
}

async function saveReporter() {
  const body = {
    name: document.getElementById('repName').value.trim(),
    role: document.getElementById('repRole').value.trim(),
    affiliation: document.getElementById('repAff').value.trim(),
    phone: document.getElementById('repPhone').value.trim()
  };

  if (!body.name || !body.role || !body.affiliation) {
    alert('Please enter the reporter name, role and affiliation.');
    return;
  }

  const url = repEditing
    ? '/api/reporters/' + encodeURIComponent(repEditing)
    : '/api/reporters';

  try {
    await apiRequest(url, {
      method: repEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    resetReporterForm();
    await loadReporters();
    await loadDropdowns();

    alert('Reporter saved successfully.');

  } catch (error) {
    alert('Error: ' + error.message);
  }
}

async function deleteReporter(id) {
  if (!confirm('Delete reporter ' + id + '?')) return;

  try {
    await apiRequest(
      '/api/reporters/' + encodeURIComponent(id),
      { method: 'DELETE' }
    );

    await loadReporters();
    await loadDropdowns();

    alert('Reporter deleted successfully.');

  } catch (error) {
    alert('Error: ' + error.message);
  }
}
