
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
    dates: ['reportedAt', 'resolvedAt'],
    required: ['locationId', 'reporterId', 'issueType', 'urgency']
  },
  collectionLogs: {
    prefix: 'CL',
    dates: ['scheduledFor'],
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

async function nextId(db, name) {
  const config = CONFIG[name];

  if (!config) {
    throw new Error('Unknown collection: ' + name);
  }

  const result = await db.collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { sequence: 1 } },
    {
      upsert: true,
      returnDocument: 'after'
    }
  );

  // Support MongoDB driver versions returning either
  // the document directly or a wrapper containing .value.
  const counter = result && result.value !== undefined
    ? result.value
    : result;

  if (!counter || !Number.isInteger(counter.sequence)) {
    throw new Error('Could not allocate ID for ' + name);
  }

  return config.prefix + String(counter.sequence).padStart(2, '0');
}

function fixDates(name, body) {
  const config = CONFIG[name];

  if (!config) return body;

  for (const field of config.dates) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) {
      continue;
    }

    if (body[field] === '' || body[field] === undefined) {
      body[field] = null;
    } else if (body[field] !== null) {
      body[field] = new Date(body[field]);
    }
  }

  return body;
}

function validate(name, body, isCreate) {
  const config = CONFIG[name];

  if (!config) return 'Unknown collection';

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
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
        return field + ' is required';
      }
    }
  }

  const textFields = {
    locations: [
      'name', 'zone', 'area', 'description'
    ],
    teams: [
      'name', 'organization', 'supervisor',
      'phone', 'shift'
    ],
    reporters: [
      'name', 'role', 'affiliation', 'phone'
    ],
    reports: [
      'locationId', 'locationName', 'area', 'reporterId', 'assignedTeamId',
      'issueType', 'urgency', 'description', 'status'
    ],
    collectionLogs: [
      'locationId', 'teamId', 'status',
      'wasteType', 'note'
    ]
  };

  for (const field of textFields[name] || []) {
    if (
      body[field] !== undefined &&
      body[field] !== null &&
      typeof body[field] !== 'string'
    ) {
      return field + ' must be text';
    }
  }

  if (name === 'locations') {
    if (
      body.name !== undefined &&
      (
        body.name.trim().length < 2 ||
        body.name.trim().length > 120
      )
    ) {
      return 'Location name must be 2–120 characters';
    }

    if (
      body.area !== undefined &&
      !['Campus', 'Village'].includes(body.area)
    ) {
      return 'Area must be Campus or Village';
    }

    if (body.binCount !== undefined) {
      const count = Number(body.binCount);

      if (!Number.isInteger(count) || count < 0) {
        return 'binCount must be a non-negative whole number';
      }

      body.binCount = count;
    }
  }

  if (name === 'teams') {
    if (
      body.members !== undefined &&
      body.members !== null &&
      body.members !== ''
    ) {
      const members = Number(body.members);

      if (!Number.isInteger(members) || members < 0) {
        return 'Members must be a non-negative whole number';
      }

      body.members = members;
    }

    if (
      body.zones !== undefined &&
      (
        !Array.isArray(body.zones) ||
        body.zones.some(zone => typeof zone !== 'string')
      )
    ) {
      return 'Zones must be a list of text values';
    }
  }

  if (name === 'reporters') {
    if (
      body.name !== undefined &&
      (
        body.name.trim().length < 2 ||
        body.name.trim().length > 80
      )
    ) {
      return 'Reporter name must be between 2 and 80 characters';
    }

    if (
      body.phone !== undefined &&
      body.phone !== null &&
      body.phone !== '' &&
      (
        typeof body.phone !== 'string' ||
        body.phone.trim().length > 25
      )
    ) {
      return 'Invalid reporter phone number';
    }
  }

  if (name === 'reports') {
    if (
      body.urgency !== undefined &&
      !['High', 'Medium', 'Low'].includes(body.urgency)
    ) {
      return 'Urgency must be High, Medium or Low';
    }

    if (
      body.locationName !== undefined &&
      (
        body.locationName.trim().length < 2 ||
        body.locationName.trim().length > 120
      )
    ) {
      return 'Area name must be between 2 and 120 characters';
    }

    if (
      body.area !== undefined &&
      !['Market', 'Campus', 'Village'].includes(body.area)
    ) {
      return 'Area must be Market, Campus or Village';
    }

    if (
      body.status !== undefined &&
      !['open', 'assigned', 'in-progress', 'resolved'].includes(body.status)
    ) {
      return 'Invalid report status';
    }

    // Descriptions are optional, but non-empty ones
    // must contain 5–2000 characters.
    if (body.description !== undefined && body.description !== null) {
      if (typeof body.description !== 'string') {
        return 'Description must be text';
      }

      const description = body.description.trim();

      if (
        description.length > 0 &&
        (description.length < 5 || description.length > 2000)
      ) {
        return 'Description must be empty or 5–2000 characters';
      }

      body.description = description;
    }

    if (
      body.issueType !== undefined &&
      (
        body.issueType.trim().length < 2 ||
        body.issueType.trim().length > 80
      )
    ) {
      return 'Issue type must be 2–80 characters';
    }
  }

  if (name === 'reports') {
    if (
      body.locationName !== undefined &&
      (
        body.locationName.trim().length < 2 ||
        body.locationName.trim().length > 120
      )
    ) {
      return 'Area name must be between 2 and 120 characters';
    }

    if (
      body.area !== undefined &&
      !['Market', 'Campus', 'Village'].includes(body.area)
    ) {
      return 'Area must be Market, Campus or Village';
    }
  }

  if (name === 'collectionLogs') {
    if (
      body.status !== undefined &&
      !['collected', 'missed'].includes(body.status)
    ) {
      return 'Status must be collected or missed';
    }
  }

  for (const field of config.dates) {
    if (
      body[field] !== undefined &&
      body[field] !== null &&
      Number.isNaN(new Date(body[field]).getTime())
    ) {
      return field + ' must be a valid date';
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
            $ifNull: [
              { $arrayElemAt: ['$loc.name', 0] },
              '$locationName'
            ]
          },
          area: {
            $ifNull: [
              { $arrayElemAt: ['$loc.area', 0] },
              '$area'
            ]
          },
          reporterName: { $arrayElemAt: ['$rep.name', 0] },
          teamName: { $arrayElemAt: ['$team.name', 0] }
        }
      },
      {
        $project: {
          loc: 0,
          rep: 0,
          team: 0
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
            $ifNull: [
              { $arrayElemAt: ['$loc.name', 0] },
              '$locationName'
            ]
          },
          area: {
            $ifNull: [
              { $arrayElemAt: ['$loc.area', 0] },
              '$area'
            ]
          },
          teamName: { $arrayElemAt: ['$team.name', 0] }
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
  nextId,
  fixDates,
  validate,
  joinStages
};
