// =========================================
// BUGEMA CLEAN COMMUNITY TRACKER
// MAIN APPLICATION
// =========================================


// =========================================
// API AND AUTHENTICATION
// =========================================

const originalFetch = window.fetch.bind(window);

window.apiToken =
  sessionStorage.getItem('bugemaToken') || '';


window.fetch = (url, options = {}) => {

  const headers =
    new Headers(options.headers || {});

  if (
    window.apiToken &&
    typeof url === 'string' &&
    url.startsWith('/api/')
  ) {

    headers.set(
      'Authorization',
      'Bearer ' + window.apiToken
    );

  }

  return originalFetch(url, {
    ...options,
    headers
  });
};


// =========================================
// UTILITY FUNCTIONS
// =========================================

function safeText(value) {

  return String(value ?? '').replace(
    /[&<>"']/g,
    character => {

      const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      };

      return entities[character];

    }
  );
}


function showMessage(
  id,
  message,
  color = 'red'
) {

  const element =
    document.getElementById(id);

  if (!element) return;

  element.textContent = message;
  element.style.color = color;
}


// =========================================
// POPUP FUNCTIONS
// =========================================

function openModal(id) {

  const box =
    document.getElementById(id);

  if (box) {

    box.classList.add('open');

  }

}


function closeModal(id) {

  const box =
    document.getElementById(id);

  if (box) {

    box.classList.remove('open');

  }

}


// Escape closes popup

document.addEventListener(
  'keydown',
  event => {

    if (event.key === 'Escape') {

      document
        .querySelectorAll('.modal-card.open')
        .forEach(box => {

          box.classList.remove('open');

        });

    }

  }
);


// =========================================
// API REQUEST
// =========================================

async function apiRequest(
  url,
  options = {}
) {

  const response =
    await fetch(url, options);

  let data;

  try {

    data = await response.json();

  } catch {

    throw new Error(
      'The server returned an invalid response.'
    );

  }


  // Session expired

  if (
    response.status === 401 &&
    window.apiToken &&
    url !== '/api/auth/login'
  ) {

    logoutAdmin();

    showMessage(
      'loginMessage',
      'Your session has expired. Please log in again.'
    );

    throw new Error(
      'Your session has expired. Please log in again.'
    );

  }


  if (!response.ok) {

    throw new Error(
      data.error ||
      'The request could not be completed.'
    );

  }


  return data;

}


// =========================================
// LOGIN
// =========================================

async function loginAdmin() {

  const email =
    document
      .getElementById('loginEmail')
      .value
      .trim();

  const password =
    document
      .getElementById('loginPassword')
      .value;


  showMessage(
    'loginMessage',
    ''
  );


  if (!email || !password) {

    showMessage(
      'loginMessage',
      'Please enter your email and password.'
    );

    return;

  }


  try {

    const data =
      await apiRequest(
        '/api/auth/login',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            email,
            password
          })

        }
      );


    if (
      !data.token ||
      !data.user ||
      data.user.role !== 'admin'
    ) {

      throw new Error(
        'This account is not an administrator.'
      );

    }


    window.apiToken =
      data.token;

    sessionStorage.setItem(
      'bugemaToken',
      data.token
    );


    document
      .getElementById('adminArea')
      .hidden = false;

    document
      .getElementById('loginPanel')
      .hidden = true;


    await loadAdminData();

  } catch (error) {

    showMessage(
      'loginMessage',
      error.message
    );

  }

}


// =========================================
// LOGOUT
// =========================================

function logoutAdmin() {

  window.apiToken = '';

  sessionStorage.removeItem(
    'bugemaToken'
  );


  document
    .getElementById('adminArea')
    .hidden = true;


  document
    .getElementById('loginPanel')
    .hidden = false;


  const password =
    document.getElementById(
      'loginPassword'
    );

  if (password) {

    password.value = '';

  }

}


// =========================================
// LOAD ADMIN DATA
// =========================================

async function loadAdminData() {

  const results =
    await Promise.allSettled([

      loadDashboard(),
      loadReports(),
      loadLocations(),
      loadTeams(),
      loadReporters(),
      loadLogs(),
      loadLogDropdowns(),
      loadDropdowns()

    ]);


  results.forEach(
    (result, index) => {

      if (
        result.status === 'rejected'
      ) {

        console.error(
          'Admin data loading failed at task ' +
          index,
          result.reason
        );

      }

    }
  );

}


// =========================================
// NAVIGATION
// =========================================

function showPage(name) {

  document
    .querySelectorAll('.page')
    .forEach(page => {

      page.classList.remove(
        'show'
      );

    });


  const selectedPage =
    document.getElementById(name);


  if (selectedPage) {

    selectedPage.classList.add(
      'show'
    );

  }


  document
    .querySelectorAll('#nav a')
    .forEach(link => {

      link.classList.toggle(
        'active',
        link.dataset.page === name
      );

    });


  if (name === 'dashboard') {

    loadDashboard();

  }

  if (name === 'reports') {

    loadReports();

  }

  if (name === 'locations') {

    loadLocations();

  }

  if (name === 'teams') {

    loadTeams();

  }

  if (name === 'reporters') {

    loadReporters();

  }

  if (name === 'logs') {

    loadLogs();
    loadLogDropdowns();

  }

}


document
  .querySelectorAll('#nav a')
  .forEach(link => {

    link.addEventListener(
      'click',
      event => {

        event.preventDefault();

        showPage(
          link.dataset.page
        );

      }
    );

  });


// =========================================
// DASHBOARD
// =========================================

async function loadDashboard() {

  try {

    const summary =
      await apiRequest(
        '/api/stats/summary'
      );


    document
      .getElementById('sTotal')
      .textContent =
      summary.totalReports ?? 0;


    document
      .getElementById('sOpen')
      .textContent =
      summary.openReports ?? 0;


    document
      .getElementById('sUrgent')
      .textContent =
      summary.urgentUnresolved ?? 0;


    document
      .getElementById('sMissed')
      .textContent =
      summary.missedCollections ?? 0;

    document
      .getElementById('sOverdue')
      .textContent =
      summary.overdueReports ?? 0;

    document
      .getElementById('sResolvedRate')
      .textContent =
      `${summary.resolvedRate ?? 0}%`;


    // By area

    try {

      const areaData =
        await apiRequest(
          '/api/stats/by-area'
        );

      const areaRows =
        document.getElementById(
          'areaRows'
        );


      if (areaRows) {

        areaRows.innerHTML =
          areaData.length

            ? areaData
                .map(item => `

                  <tr>

                    <td>
                      ${safeText(
                        item._id ||
                        'Unknown'
                      )}
                    </td>

                    <td>
                      ${safeText(
                        item.count ??
                        0
                      )}
                    </td>

                    <td>
                      ${safeText(
                        item.unresolved ??
                        0
                      )}
                    </td>

                  </tr>

                `)
                .join('')

            : `
              <tr>
                <td colspan="3">
                  No area data available
                </td>
              </tr>
            `;

      }

    } catch (error) {

      console.error(
        'Area statistics error:',
        error
      );

    }


    // By status

    try {

      const statuses =
        await apiRequest(
          '/api/stats/by-status'
        );

      const statusRows =
        document.getElementById(
          'statusRows'
        );


      if (statusRows) {

        statusRows.innerHTML =
          statuses.length

            ? statuses
                .map(item => `

                  <tr>

                    <td>
                      ${safeText(
                        item._id ||
                        'Unknown'
                      )}
                    </td>

                    <td>
                      ${safeText(
                        item.count ??
                        0
                      )}
                    </td>

                  </tr>

                `)
                .join('')

            : `
              <tr>
                <td colspan="2">
                  No status data available
                </td>
              </tr>
            `;

      }

    } catch (error) {

      console.error(
        'Status statistics error:',
        error
      );

    }


    // By location

    try {

      const locations =
        await apiRequest(
          '/api/stats/by-location'
        );

      const locationRows =
        document.getElementById(
          'locRows'
        );


      if (locationRows) {

        locationRows.innerHTML =
          locations.length

            ? locations
                .map(item => `

                  <tr>

                    <td>
                      ${safeText(
                        item.locationName ||
                        'Unknown location'
                      )}
                    </td>

                    <td>
                      ${safeText(
                        item.area ||
                        'Unspecified'
                      )}
                    </td>

                    <td>
                      ${safeText(
                        item.count ??
                        0
                      )}
                    </td>

                  </tr>

                `)
                .join('')

            : `
              <tr>
                <td colspan="3">
                  No location data available
                </td>
              </tr>
            `;

      }

    } catch (error) {

      console.error(
        'Location statistics error:',
        error
      );

    }

  } catch (error) {

    console.error(
      'Dashboard error:',
      error
    );

  }

}


// =========================================
// REPORT DROPDOWNS
// =========================================

async function loadDropdowns() {

  try {

    const locations =
      await apiRequest(
        '/api/locations'
      );

    const teams =
      await apiRequest(
        '/api/teams'
      );

    const reporters =
      await apiRequest(
        '/api/reporters'
      );


    const locationSelect =
      document.getElementById(
        'reportLocation'
      );


    const reporterSelect =
      document.getElementById(
        'reportReporter'
      );


    const teamSelect =
      document.getElementById(
        'editTeam'
      );


    if (locationSelect) {

      locationSelect.innerHTML =
        '<option value="">Select location</option>' +

        locations
          .map(location => `

            <option value="${safeText(
              location._id
            )}">

              ${safeText(
                location.name
              )}
              (${safeText(
                location.area
              )})

            </option>

          `)
          .join('');

    }


    if (reporterSelect) {

      reporterSelect.innerHTML =
        '<option value="">Select reporter</option>' +

        reporters
          .map(reporter => `

            <option value="${safeText(
              reporter._id
            )}">

              ${safeText(
                reporter.name
              )}

            </option>

          `)
          .join('');

    }


    if (teamSelect) {

      teamSelect.innerHTML =
        '<option value="">-- none --</option>' +

        teams
          .map(team => `

            <option value="${safeText(
              team._id
            )}">

              ${safeText(
                team.name
              )}

            </option>

          `)
          .join('');

    }

  } catch (error) {

    console.error(
      'Dropdown loading error:',
      error
    );

  }

}


// =========================================
// ADD REPORT
// =========================================

function openAddReport() {

  document
    .getElementById(
      'reportFormTitle'
    )
    .textContent =
    'Add a Report';


  document
    .getElementById(
      'reportLocation'
    )
    .value = '';


  document
    .getElementById(
      'reportReporter'
    )
    .value = '';


  document
    .getElementById(
      'reportIssueType'
    )
    .value = '';


  document
    .getElementById(
      'reportUrgency'
    )
    .value = 'Medium';


  document
    .getElementById(
      'reportDescription'
    )
    .value = '';


  loadDropdowns();

  openModal('reportCard');

}


function resetReportForm() {

  const location =
    document.getElementById(
      'reportLocation'
    );

  const reporter =
    document.getElementById(
      'reportReporter'
    );

  const issue =
    document.getElementById(
      'reportIssueType'
    );

  const urgency =
    document.getElementById(
      'reportUrgency'
    );

  const description =
    document.getElementById(
      'reportDescription'
    );


  if (location) location.value = '';

  if (reporter) reporter.value = '';

  if (issue) issue.value = '';

  if (urgency) urgency.value =
    'Medium';

  if (description) description.value =
    '';


  closeModal('reportCard');

}


async function saveReport() {

  const body = {

    locationId:
      document
        .getElementById(
          'reportLocation'
        )
        .value,

    reporterId:
      document
        .getElementById(
          'reportReporter'
        )
        .value,

    issueType:
      document
        .getElementById(
          'reportIssueType'
        )
        .value,

    urgency:
      document
        .getElementById(
          'reportUrgency'
        )
        .value,

    description:
      document
        .getElementById(
          'reportDescription'
        )
        .value
        .trim()

  };


  if (
    !body.locationId ||
    !body.reporterId ||
    !body.issueType
  ) {

    alert(
      'Please select a location, reporter and issue type.'
    );

    return;

  }


  try {

    await apiRequest(
      '/api/reports',
      {

        method: 'POST',

        headers: {
          'Content-Type':
            'application/json'
        },

        body:
          JSON.stringify(body)

      }
    );


    resetReportForm();

    await loadReports();

    await loadDashboard();

    alert(
      'Report saved successfully.'
    );

  } catch (error) {

    alert(
      'Error: ' +
      error.message
    );

  }

}


// =========================================
// REPORTS
// =========================================

let reportsCache = [];
let editingId = null;
let reportSearchTimer = null;

function formatAdminDate(value) {
  if (!value) return '-';

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleString();
}

function scheduleReportSearch() {
  clearTimeout(reportSearchTimer);
  reportSearchTimer = setTimeout(loadReports, 250);
}


async function loadReports() {

  try {

    const locationFilter =
      document.getElementById('reportLocationFilter');

    if (locationFilter && !locationFilter.dataset.loaded) {
      const locations = await apiRequest('/api/locations');

      locations.forEach(location => {
        const option = document.createElement('option');
        option.value = location._id;
        option.textContent = `${location.name} (${location.area})`;
        locationFilter.appendChild(option);
      });

      locationFilter.dataset.loaded = 'true';
    }

    const area =
      document
        .getElementById(
          'areaFilter'
        )?.value || '';


    const status =
      document
        .getElementById(
          'statusFilter'
        )?.value || '';

      const urgency = document.getElementById('urgencyFilter')?.value || '';
      const locationId = locationFilter?.value || '';
      const from = document.getElementById('reportFromFilter')?.value || '';
      const to = document.getElementById('reportToFilter')?.value || '';
      const search = document.getElementById('reportSearch')?.value.trim() || '';


    const params =
      new URLSearchParams();


    if (area) {

      params.set(
        'area',
        area
      );

    }


    if (status) {

      params.set(
        'status',
        status
      );

    }

    if (urgency) params.set('urgency', urgency);
    if (locationId) params.set('locationId', locationId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (search) params.set('search', search);


    reportsCache =
      await apiRequest(
        '/api/reports?' +
        params.toString()
      );

    const reportLoadMessage = document.getElementById('reportLoadMessage');
    if (reportLoadMessage) reportLoadMessage.textContent = '';


    const rows =
      document.getElementById(
        'reportRows'
      );


    if (!rows) return;


    rows.innerHTML =
      reportsCache.length

        ? reportsCache
            .map(report => {
              const isOverdue =
                report.status !== 'resolved' &&
                Date.now() - new Date(report.reportedAt).getTime() > 72 * 60 * 60 * 1000;

              return `

              <tr class="${isOverdue ? 'overdue-row' : ''}">

                <td>
                  ${safeText(
                    report._id
                  )}
                </td>

                <td>
                  ${safeText(
                    report.locationDetails ||
                    report.locationName ||
                    '-'
                  )}
                </td>

                <td>
                  ${safeText(
                    report.locationType ||
                    report.area ||
                    '-'
                  )}
                </td>

                <td>
                  ${safeText(
                    report.issueType
                  )}
                </td>

                <td>

                  <span class="${safeText(
                    report.urgency
                  )}">

                    ${safeText(
                      report.urgency
                    )}

                  </span>

                </td>

                <td>
                  ${safeText(
                    report.status
                  )}
                </td>

                <td>
                  ${safeText(
                    report.teamName ||
                    '-'
                  )}
                </td>

                <td>
                  <small>Assigned: ${safeText(formatAdminDate(report.assignmentReceivedAt))}</small><br>
                  <small>Started: ${safeText(formatAdminDate(report.workStartedAt))}</small><br>
                  <small>Finished: ${safeText(formatAdminDate(report.workFinishedAt))}</small>
                </td>

                <td>
                  ${isOverdue ? '<span class="overdue-label">Overdue</span>' : safeText(report.status === 'resolved' ? 'Resolved' : 'Within 72 hours')}
                </td>

                <td>

                  <button
                    class="small edit"
                    onclick="openEdit('${safeText(
                      report._id
                    )}')">

                    Edit

                  </button>


                  <button
                    class="small del"
                    onclick="deleteReport('${safeText(
                      report._id
                    )}')">

                    Delete

                  </button>

                </td>

              </tr>

            `;
            })
            .join('')

        : `
          <tr>
            <td colspan="10">
              No reports found
            </td>
          </tr>
        `;

  } catch (error) {

    const reportLoadMessage = document.getElementById('reportLoadMessage');
    if (reportLoadMessage) {
      reportLoadMessage.textContent =
        `Reports could not be loaded: ${error.message}`;
    }

    console.error(
      'Reports loading error:',
      error
    );

  }

}


// =========================================
// EDIT REPORT
// =========================================

function openEdit(id) {

  const report =
    reportsCache.find(
      item =>
        item._id === id
    );


  if (!report) {

    alert(
      'Report could not be found.'
    );

    return;

  }


  editingId = id;


  document
    .getElementById(
      'editId'
    )
    .textContent =
    id;


  document
    .getElementById(
      'editStatus'
    )
    .value =
    report.status;


  document
    .getElementById(
      'editUrgency'
    )
    .value =
    report.urgency;


  document
    .getElementById(
      'editTeam'
    )
    .value =
    report.assignedTeamId ||
    '';


  openModal('editCard');

}


function closeEdit() {

  closeModal(
    'editCard'
  );

  editingId = null;

}


async function saveEdit() {

  if (!editingId) return;


  const body = {

    status:
      document
        .getElementById(
          'editStatus'
        )
        .value,

    urgency:
      document
        .getElementById(
          'editUrgency'
        )
        .value,

    assignedTeamId:
      document
        .getElementById(
          'editTeam'
        )
        .value

  };


  try {

    await apiRequest(
      '/api/reports/' +
      encodeURIComponent(
        editingId
      ),
      {

        method: 'PUT',

        headers: {
          'Content-Type':
            'application/json'
        },

        body:
          JSON.stringify(
            body
          )

      }
    );


    closeEdit();

    await loadReports();

    await loadDashboard();

  } catch (error) {

    alert(
      'Error: ' +
      error.message
    );

  }

}


async function deleteReport(id) {

  if (
    !confirm(
      'Delete report ' +
      id +
      '?'
    )
  ) {

    return;

  }


  try {

    await apiRequest(
      '/api/reports/' +
      encodeURIComponent(
        id
      ),
      {
        method:
          'DELETE'
      }
    );


    await loadReports();

    await loadDashboard();

  } catch (error) {

    alert(
      'Error: ' +
      error.message
    );

  }

}


// =========================================
// RESTORE ADMIN SESSION
// =========================================

async function restoreAdminSession() {

  if (!window.apiToken) {

    return;

  }


  try {

    const user =
      await apiRequest(
        '/api/auth/me'
      );


    if (
      !user ||
      user.role !== 'admin'
    ) {

      throw new Error(
        'This account is not an administrator.'
      );

    }


    document
      .getElementById(
        'adminArea'
      )
      .hidden = false;


    document
      .getElementById(
        'loginPanel'
      )
      .hidden = true;


    await loadAdminData();

  } catch (error) {

    logoutAdmin();

  }

}


// =========================================
// START
// =========================================

restoreAdminSession();