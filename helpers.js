
const REPORT_STATUSES = [
  'open',
  'under-review',
  'assigned',
  'in-progress',
  'resolved',
  'rejected'
];

const CLOSED_REPORT_STATUSES = [
  'resolved',
  'rejected'
];

const CONFIG = {
  locations: {
    prefix: 'LC',
    dates: [],
    required: ['name', 'zone', 'area']
  },
  teams: {
    prefix: 'TM',
    dates: [],
    required: ['name', 'organization']
  },
  reporters: {
    prefix: 'RP',
    dates: [],
    required: ['name', 'role', 'affiliation']
  },
  reports: {
    prefix: 'RPT',
    dates: [
      'reportedAt',
      'resolvedAt',
      'assignmentReceivedAt',
      'workStartedAt',
      'workFinishedAt'
    ],
    required: ['reporterId', 'issueType', 'urgency']
  },
  collectionLogs: {
    prefix: 'CL',
    dates: ['scheduledFor', 'completedAt'],
    required: ['locationId', 'teamId', 'scheduledFor', 'status']
  }
};

const REFERENCES = {
  locations: [
    ['reports', 'locationId'],
    ['collectionLogs', 'locationId']
  ],
  teams: [
    ['reports', 'assignedTeamId'],
    ['collectionLogs', 'teamId']
  ],
  reporters: [
    ['reports', 'reporterId']
  ],
  reports: [],
  collectionLogs: []
};

function isPlainObject(value) {
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date);
}

function isValidDate(value) {
  return value instanceof Date &&
    !Number.isNaN(value.getTime());
}

// Allocate IDs using an atomic MongoDB counter.
// The initial synchronisation protects databases that
// already contain records but do not yet have counters.
async function nextId(db, name) {
  const config = CONFIG[name];

  if (!config) {
    throw new Error(`Unknown collection: ${name}`);
  }

  const collection = db.collection(name);
  const counters = db.collection('counters');

  const highestRecord = await collection.aggregate([
    {
      $match: {
        _id: {
          $regex: `^${config.prefix}[0-9]+$`
        }
      }
    },
    {
      $project: {
        sequence: {
          $convert: {
            input: {
              $substrCP: [
                '$_id',
                config.prefix.length,
                20
              ]
            },
            to: 'long',
            onError: 0,
            onNull: 0
          }
        }
      }
    },
    {
      $sort: {
        sequence: -1
      }
    },
    {
      $limit: 1
    }
  ]).next();

  if (highestRecord && highestRecord.sequence > 0) {
    await counters.updateOne(
      { _id: name },
      {
        $max: {
          sequence: highestRecord.sequence
        }
      },
      { upsert: true }
    );
  }

  const result = await counters.findOneAndUpdate(
    { _id: name },
    {
      $inc: {
        sequence: 1
      }
    },
    {
      upsert: true,
      returnDocument: 'after'
    }
  );

  // MongoDB driver versions may return either the
  // updated document or a wrapper containing .value.
  const counter = result && result.value !== undefined
    ? result.value
    : result;

  if (
    !counter ||
    !Number.isInteger(counter.sequence) ||
    counter.sequence < 1
  ) {
    throw new Error(`Could not allocate an ID for ${name}`);
  }

  return config.prefix +
    String(counter.sequence).padStart(2, '0');
}

// Convert configured date fields into Date objects.
// Invalid dates are left for validate() to reject.
function fixDates(name, body) {
  const config = CONFIG[name];

  if (!config || !isPlainObject(body)) {
    return body;
  }

  for (const field of config.dates) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) {
      continue;
    }

    const value = body[field];

    if (value === '' || value === undefined || value === null) {
      body[field] = null;
      continue;
    }

    const date = value instanceof Date
      ? value
      : new Date(value);

    body[field] = date;
  }

  return body;
}

function validate(name, body, isCreate) {
  const config = CONFIG[name];

  if (!config) {
    return 'Unknown collection';
  }

  if (!isPlainObject(body)) {
    return 'Invalid record data';
  }

  if (isCreate) {
    for (const field of config.required) {
      const value = body[field];

      if (
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '')
      ) {
        return `${field} is required`;
      }
    }
  }

  const textFields = {
    locations: [
      'name',
      'zone',
      'area',
      'description'
    ],
    teams: [
      'name',
      'organization',
      'supervisor',
      'phone',
      'shift'
    ],
    reporters: [
      'name',
      'role',
      'affiliation',
      'phone'
    ],
    reports: [
      'locationId',
      'locationType',
      'locationDetails',
      'reporterId',
      'assignedTeamId',
      'issueType',
      'urgency',
      'description',
      'status'
    ],
    collectionLogs: [
      'locationId',
      'teamId',
      'status',
      'wasteType',
      'note'
    ]
  };

  for (const field of textFields[name] || []) {
    if (
      body[field] !== undefined &&
      body[field] !== null &&
      typeof body[field] !== 'string'
    ) {
      return `${field} must be text`;
    }
  }

  // LOCATIONS
  if (name === 'locations') {
    if (body.name !== undefined) {
      body.name = body.name.trim();

      if (body.name.length < 2 || body.name.length > 120) {
        return 'Location name must be 2–120 characters';
      }
    }

    if (body.zone !== undefined) {
      body.zone = body.zone.trim();

      if (body.zone.length < 1 || body.zone.length > 120) {
        return 'Zone must be 1–120 characters';
      }
    }

    if (
      body.area !== undefined &&
      !['Campus', 'Village'].includes(body.area)
    ) {
      return 'Area must be Campus or Village';
    }

    if (body.description !== undefined && body.description !== null) {
      if (typeof body.description !== 'string') {
        return 'Description must be text';
      }

      body.description = body.description.trim();

      if (body.description.length > 500) {
        return 'Location description cannot exceed 500 characters';
      }
    }

    if (body.binCount !== undefined) {
      const count = Number(body.binCount);

      if (!Number.isInteger(count) || count < 0 || count > 100000) {
        return 'Bin count must be a non-negative whole number';
      }

      body.binCount = count;
    }
  }

  // TEAMS
  if (name === 'teams') {
    for (const field of ['name', 'organization']) {
      if (body[field] !== undefined) {
        body[field] = body[field].trim();

        if (!body[field] || body[field].length > 120) {
          return `${field} must be between 1 and 120 characters`;
        }
      }
    }

    for (const field of ['supervisor', 'phone', 'shift']) {
      if (body[field] !== undefined && body[field] !== null) {
        body[field] = body[field].trim();

        if (body[field].length > 120) {
          return `${field} cannot exceed 120 characters`;
        }
      }
    }

    if (body.members !== undefined && body.members !== null && body.members !== '') {
      const members = Number(body.members);

      if (!Number.isInteger(members) || members < 0 || members > 100000) {
        return 'Members must be a non-negative whole number';
      }

      body.members = members;
    }

    if (body.zones !== undefined) {
      if (
        !Array.isArray(body.zones) ||
        body.zones.length > 100 ||
        body.zones.some(zone =>
          typeof zone !== 'string' ||
          zone.trim().length === 0 ||
          zone.trim().length > 120
        )
      ) {
        return 'Zones must be a list of valid text values';
      }

      body.zones = [...new Set(body.zones.map(zone => zone.trim()))];
    }
  }

  // REPORTERS
  if (name === 'reporters') {
    if (body.name !== undefined) {
      body.name = body.name.trim();

      if (body.name.length < 2 || body.name.length > 80) {
        return 'Reporter name must be between 2 and 80 characters';
      }
    }

    for (const field of ['role', 'affiliation']) {
      if (body[field] !== undefined) {
        body[field] = body[field].trim();

        if (!body[field] || body[field].length > 120) {
          return `${field} must be between 1 and 120 characters`;
        }
      }
    }

    if (body.phone !== undefined && body.phone !== null) {
      body.phone = body.phone.trim();

      if (body.phone.length > 25) {
        return 'Reporter phone number cannot exceed 25 characters';
      }
    }
  }

  // REPORTS
  if (name === 'reports') {
    if (
      isCreate &&
      !body.locationId &&
      (
        typeof body.locationDetails !== 'string' ||
        body.locationDetails.trim().length < 3 ||
        body.locationDetails.trim().length > 150
      )
    ) {
      return 'Select a location or provide exact location details';
    }

    if (body.locationDetails !== undefined && body.locationDetails !== null) {
      if (typeof body.locationDetails !== 'string') {
        return 'Location details must be text';
      }

      body.locationDetails = body.locationDetails.trim();

      if (
        body.locationDetails.length < 3 ||
        body.locationDetails.length > 150
      ) {
        return 'Location details must be 3–150 characters';
      }
    }

    const validLocationTypes = [
      'University / Campus',
      'Resident',
      'Market',
      'Trading Centre',
      'Roadside / Service Area'
    ];

    if (
      body.locationType !== undefined &&
      !validLocationTypes.includes(body.locationType)
    ) {
      return 'Invalid report location type';
    }

    if (
      body.urgency !== undefined &&
      !['High', 'Medium', 'Low'].includes(body.urgency)
    ) {
      return 'Urgency must be High, Medium or Low';
    }

    if (
      body.status !== undefined &&
      !REPORT_STATUSES.includes(body.status)
    ) {
      return 'Invalid report status';
    }

    if (body.issueType !== undefined) {
      body.issueType = body.issueType.trim();

      if (body.issueType.length < 2 || body.issueType.length > 80) {
        return 'Issue type must be 2–80 characters';
      }
    }

    if (body.description !== undefined && body.description !== null) {
      if (typeof body.description !== 'string') {
        return 'Description must be text';
      }

      body.description = body.description.trim();

      if (
        body.description.length > 0 &&
        (
          body.description.length < 5 ||
          body.description.length > 2000
        )
      ) {
        return 'Description must be empty or 5–2000 characters';
      }
    }
  }

  // COLLECTION LOGS
  if (name === 'collectionLogs') {
    if (
      body.status !== undefined &&
      !['collected', 'missed'].includes(body.status)
    ) {
      return 'Status must be collected or missed';
    }

    if (body.wasteType !== undefined && body.wasteType !== null) {
      body.wasteType = body.wasteType.trim();

      if (body.wasteType.length > 80) {
        return 'Waste type cannot exceed 80 characters';
      }
    }

    if (body.note !== undefined && body.note !== null) {
      body.note = body.note.trim();

      if (body.note.length > 1000) {
        return 'Collection note cannot exceed 1000 characters';
      }
    }
  }

  // DATE VALIDATION
  for (const field of config.dates) {
    if (
      body[field] !== undefined &&
      body[field] !== null &&
      !isValidDate(body[field])
    ) {
      return `${field} must be a valid date`;
    }
  }

  return null;
}

function joinStages(name) {
  if (name === 'reports') {
    return [
      {
        $lookup: {
          from: 'locations',
          localField: 'locationId',
          foreignField: '_id',
          as: 'loc'
        }
      },
      {
        $lookup: {
          from: 'reporters',
          localField: 'reporterId',
          foreignField: '_id',
          as: 'rep'
        }
      },
      {
        $lookup: {
          from: 'teams',
          localField: 'assignedTeamId',
          foreignField: '_id',
          as: 'team'
        }
      },
      {
        $addFields: {
          locationName: {
            $arrayElemAt: ['$loc.name', 0]
          },
          area: {
            $arrayElemAt: ['$loc.area', 0]
          },
          reporterName: {
            $arrayElemAt: ['$rep.name', 0]
          },
          teamName: {
            $arrayElemAt: ['$team.name', 0]
          }
        }
      },
      {
        $project: {
          loc: 0,
          rep: 0,
          team: 0,
          trackingTokenHash: 0
        }
      }
    ];
  }

  if (name === 'collectionLogs') {
    return [
      {
        $lookup: {
          from: 'locations',
          localField: 'locationId',
          foreignField: '_id',
          as: 'loc'
        }
      },
      {
        $lookup: {
          from: 'teams',
          localField: 'teamId',
          foreignField: '_id',
          as: 'team'
        }
      },
      {
        $addFields: {
          locationName: {
            $arrayElemAt: ['$loc.name', 0]
          },
          area: {
            $arrayElemAt: ['$loc.area', 0]
          },
          teamName: {
            $arrayElemAt: ['$team.name', 0]
          }
        }
      },
      {
        $project: {
          loc: 0,
          team: 0
        }
      }
    ];
  }

  return [];
}

module.exports = {
  CONFIG,
  REFERENCES,
  REPORT_STATUSES,
  CLOSED_REPORT_STATUSES,
  nextId,
  fixDates,
  validate,
  joinStages
};
