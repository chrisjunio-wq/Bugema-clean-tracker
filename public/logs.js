// =========================================
// COLLECTION LOGS
// =========================================

let logEditing = null;


// =========================================
// OPEN ADD LOG
// =========================================

async function openAddLog() {

  logEditing = null;


  document
    .getElementById(
      'logFormTitle'
    )
    .textContent =
    'Add a Collection Log';


  document
    .getElementById(
      'logDate'
    )
    .value = '';


  document
    .getElementById(
      'logStatus'
    )
    .value =
    'collected';


  document
    .getElementById(
      'logWaste'
    )
    .value =
    'Mixed';


  document
    .getElementById(
      'logNote'
    )
    .value = '';


  await loadLogDropdowns();

  openModal(
    'logCard'
  );

}


// =========================================
// LOAD COLLECTION LOGS
// =========================================

async function loadLogs() {

  try {

    const status =
      document
        .getElementById(
          'logStatusFilter'
        )?.value || '';


    const area =
      document
        .getElementById(
          'logAreaFilter'
        )?.value || '';


    const params =
      new URLSearchParams();


    if (status) {

      params.set(
        'status',
        status
      );

    }


    if (area) {

      params.set(
        'area',
        area
      );

    }


    const data =
      await apiRequest(
        '/api/collectionLogs?' +
        params.toString()
      );


    document
      .getElementById(
        'logRowsTable'
      )
      .innerHTML =

      data
        .map(log => `

          <tr
            ${log.status === 'missed'
              ? 'style="background:#fdecee"'
              : ''}>

            <td>
              ${safeText(
                log._id
              )}
            </td>

            <td>
              ${safeText(
                log.locationName ||
                log.locationId
              )}
            </td>

            <td>
              ${safeText(
                log.area ||
                ''
              )}
            </td>

            <td>
              ${safeText(
                log.teamName ||
                log.teamId
              )}
            </td>

            <td>
              ${safeText(
                log.scheduledFor
                  ? String(
                      log.scheduledFor
                    ).substring(
                      0,
                      10
                    )
                  : ''
              )}
            </td>

            <td>

              ${
                log.status === 'missed'

                  ? '<b style="color:#dc3545">missed</b>'

                  : 'collected'

              }

            </td>

            <td>
              ${safeText(
                log.completedAt
                  ? new Date(log.completedAt).toLocaleString()
                  : '-'
              )}
            </td>

            <td>
              ${safeText(
                log.wasteType ||
                ''
              )}
            </td>

            <td>
              ${safeText(
                log.note ||
                ''
              )}
            </td>

            <td>

              <button
                class="small edit"
                onclick="editLog('${safeText(
                  log._id
                )}')">

                Edit

              </button>


              <button
                class="small del"
                onclick="deleteLog('${safeText(
                  log._id
                )}')">

                Delete

              </button>

            </td>

          </tr>

        `)
        .join('');

  } catch (error) {

    console.error(
      'Loading collection logs failed:',
      error
    );

  }

}


// =========================================
// LOAD LOG DROPDOWNS
// =========================================

async function loadLogDropdowns() {

  try {

    const locations =
      await apiRequest(
        '/api/locations'
      );


    const teams =
      await apiRequest(
        '/api/teams'
      );


    const locationSelect =
      document.getElementById(
        'logLocation'
      );


    const teamSelect =
      document.getElementById(
        'logTeam'
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


    if (teamSelect) {

      teamSelect.innerHTML =
        '<option value="">Select team</option>' +

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
      'Loading collection-log dropdowns failed:',
      error
    );

  }

}


// =========================================
// EDIT LOG
// =========================================

async function editLog(id) {

  try {

    await loadLogDropdowns();


    const log =
      await apiRequest(
        '/api/collectionLogs/' +
        encodeURIComponent(id)
      );


    logEditing = id;


    document
      .getElementById(
        'logFormTitle'
      )
      .textContent =
      'Edit Collection Log ' +
      id;


    document
      .getElementById(
        'logLocation'
      )
      .value =
      log.locationId ||
      '';


    document
      .getElementById(
        'logTeam'
      )
      .value =
      log.teamId ||
      '';


    document
      .getElementById(
        'logDate'
      )
      .value =
      log.scheduledFor
        ? String(
            log.scheduledFor
          ).substring(
            0,
            10
          )
        : '';


    document
      .getElementById(
        'logStatus'
      )
      .value =
      log.status ||
      'collected';


    document
      .getElementById(
        'logWaste'
      )
      .value =
      log.wasteType ||
      'Mixed';


    document
      .getElementById(
        'logNote'
      )
      .value =
      log.note ||
      '';


    openModal(
      'logCard'
    );

  } catch (error) {

    alert(
      'Could not load collection log: ' +
      error.message
    );

  }

}


// =========================================
// RESET LOG FORM
// =========================================

function resetLogForm() {

  logEditing = null;


  document
    .getElementById(
      'logFormTitle'
    )
    .textContent =
    'Add a Collection Log';


  document
    .getElementById(
      'logDate'
    )
    .value = '';


  document
    .getElementById(
      'logStatus'
    )
    .value =
    'collected';


  document
    .getElementById(
      'logWaste'
    )
    .value =
    'Mixed';


  document
    .getElementById(
      'logNote'
    )
    .value = '';


  closeModal(
    'logCard'
  );

}


// =========================================
// SAVE LOG
// =========================================

async function saveLog() {

  const body = {

    locationId:
      document
        .getElementById(
          'logLocation'
        )
        .value,

    teamId:
      document
        .getElementById(
          'logTeam'
        )
        .value,

    scheduledFor:
      document
        .getElementById(
          'logDate'
        )
        .value,

    status:
      document
        .getElementById(
          'logStatus'
        )
        .value,

    wasteType:
      document
        .getElementById(
          'logWaste'
        )
        .value,

    note:
      document
        .getElementById(
          'logNote'
        )
        .value
        .trim()

  };


  if (
    !body.locationId ||
    !body.teamId ||
    !body.scheduledFor
  ) {

    alert(
      'Please select a location, team and scheduled date.'
    );

    return;

  }


  const url =
    logEditing

      ? '/api/collectionLogs/' +
        encodeURIComponent(
          logEditing
        )

      : '/api/collectionLogs';


  try {

    await apiRequest(
      url,
      {

        method:
          logEditing
            ? 'PUT'
            : 'POST',

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


    resetLogForm();

    await loadLogs();

    await loadDashboard();


    alert(
      'Collection log saved successfully.'
    );

  } catch (error) {

    alert(
      'Error: ' +
      error.message
    );

  }

}


// =========================================
// DELETE LOG
// =========================================

async function deleteLog(id) {

  if (
    !confirm(
      'Delete collection log ' +
      id +
      '?'
    )
  ) {

    return;

  }


  try {

    await apiRequest(
      '/api/collectionLogs/' +
      encodeURIComponent(id),
      {
        method:
          'DELETE'
      }
    );


    await loadLogs();

    await loadDashboard();


    alert(
      'Collection log deleted successfully.'
    );

  } catch (error) {

    alert(
      'Error: ' +
      error.message
    );

  }

}