
let teamEditing = null;

function openAddTeam() {
  resetTeamForm();
  openCollectionForm('teamFormCard', 'teamName');
}

async function loadTeams() {
  try {
    const org = document.getElementById('teamOrgFilter')?.value || '';
    const params = new URLSearchParams();

    if (org) params.set('organization', org);

    const data = await apiRequest('/api/teams?' + params.toString());

    document.getElementById('teamRowsTable').innerHTML = data.map(team => `
      <tr>
        <td>${safeText(team._id)}</td>
        <td>${safeText(team.name)}</td>
        <td>${safeText(team.organization)}</td>
        <td>${safeText(team.supervisor || '')}</td>
        <td>${safeText(team.phone || '')}</td>
        <td>${safeText(team.zones ? team.zones.join(', ') : '')}</td>
        <td>${safeText(team.members ?? '')}</td>
        <td>${safeText(team.shift || '')}</td>
        <td>
          <button class="small edit"
            onclick="editTeam('${safeText(team._id)}')">Edit</button>
          <button class="small del"
            onclick="deleteTeam('${safeText(team._id)}')">Delete</button>
        </td>
      </tr>
    `).join('');

  } catch (error) {
    console.error('Loading teams failed:', error);
  }
}

async function editTeam(id) {
  try {
    const team = await apiRequest(
      '/api/teams/' + encodeURIComponent(id)
    );

    teamEditing = id;

    document.getElementById('teamFormTitle').textContent =
      'Edit Team ' + id;

    document.getElementById('teamName').value = team.name || '';
    document.getElementById('teamOrg').value = team.organization || '';
    document.getElementById('teamSupervisor').value = team.supervisor || '';
    document.getElementById('teamPhone').value = team.phone || '';
    document.getElementById('teamZones').value =
      team.zones ? team.zones.join(', ') : '';
    document.getElementById('teamMembers').value = team.members ?? '';
    document.getElementById('teamShift').value = team.shift || '';

    openCollectionForm('teamFormCard', 'teamName');

  } catch (error) {
    alert('Could not load team: ' + error.message);
  }
}

function resetTeamForm() {
  closeCollectionForm('teamFormCard');
  teamEditing = null;

  document.getElementById('teamFormTitle').textContent = 'Add a Team';

  [
    'teamName',
    'teamSupervisor',
    'teamPhone',
    'teamZones',
    'teamMembers',
    'teamShift'
  ].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('teamOrg').value = 'University';
}

async function saveTeam() {
  const membersValue = document.getElementById('teamMembers').value;

  const body = {
    name: document.getElementById('teamName').value.trim(),
    organization: document.getElementById('teamOrg').value.trim(),
    supervisor: document.getElementById('teamSupervisor').value.trim(),
    phone: document.getElementById('teamPhone').value.trim(),
    zones: document.getElementById('teamZones').value
      .split(',')
      .map(zone => zone.trim())
      .filter(Boolean),
    members: membersValue === '' ? 0 : Number(membersValue),
    shift: document.getElementById('teamShift').value.trim()
  };

  if (!body.name || !body.organization) {
    alert('Please enter the team name and organization.');
    return;
  }

  if (!Number.isInteger(body.members) || body.members < 0) {
    alert('Members must be a non-negative whole number.');
    return;
  }

  const url = teamEditing
    ? '/api/teams/' + encodeURIComponent(teamEditing)
    : '/api/teams';

  try {
    await apiRequest(url, {
      method: teamEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    resetTeamForm();
    await loadTeams();
    await loadDropdowns();

    alert('Team saved successfully.');

  } catch (error) {
    alert('Error: ' + error.message);
  }
}

async function deleteTeam(id) {
  if (!confirm('Delete team ' + id + '?')) return;

  try {
    await apiRequest(
      '/api/teams/' + encodeURIComponent(id),
      { method: 'DELETE' }
    );

    await loadTeams();
    await loadDropdowns();

    alert('Team deleted successfully.');

  } catch (error) {
    alert('Error: ' + error.message);
  }
}
