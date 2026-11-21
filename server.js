require('dotenv').config();

const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const crypto = require('crypto');

const { requireAuth, requireAdmin } = require('./auth');
const authRoutes = require('./routes-auth');
const registerStats = require('./stats');

const {
  REFERENCES,
  nextId,
  fixDates,
  validate,
  joinStages
} = require('./helpers');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('MONGO_URI is missing from your environment settings.');
  process.exit(1);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be configured with at least 32 characters.');
  process.exit(1);
}

app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

let db;

const collections = [
  'locations',
  'teams',
  'reporters',
  'reports',
  'collectionLogs'
];

function isValidId(value) {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 30;
}

function publicLocation(location) {
  if (!location) return null;

  const {
    _id,
    name,
    zone,
    area,
    binCount,
    description
  } = location;

  return {
    _id,
    name,
    zone,
    area,
    binCount,
    description
  };
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function hashTrackingToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function trackingActivity(title, message, createdAt = new Date()) {
  return { title, message, createdAt };
}

// ==========================================
// HEALTH CHECK
// ==========================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ==========================================
// PUBLIC LOCATIONS
// ==========================================

app.get('/api/locations', asyncRoute(async (req, res) => {
  const locations = await db.collection('locations')
    .find({})
    .sort({ name: 1 })
    .toArray();

  res.json(locations.map(publicLocation));
}));

// ==========================================
// PUBLIC REPORT SUBMISSION
// ==========================================

app.post('/api/reports', asyncRoute(async (req, res, next) => {
  const body = req.body || {};

  // Administrator-created reports continue to the protected route.
  if (typeof body.reporterName !== 'string') {
    return next();
  }

  const {
    reporterName,
    reporterPhone,
    reporterGroup,
    locationId,
    locationName,
    locationDetails,
    issueType,
    urgency,
    description
  } = body;

  if (
    reporterName.trim().length < 2 ||
    reporterName.trim().length > 80
  ) {
    return res.status(400).json({
      error: 'Enter a valid reporter name'
    });
  }

  if (
    reporterPhone !== undefined &&
    reporterPhone !== '' &&
    (
      typeof reporterPhone !== 'string' ||
      reporterPhone.trim().length > 25
    )
  ) {
    return res.status(400).json({
      error: 'Enter a valid phone number'
    });
  }

  if (!['Market', 'Resident', 'University/Campus'].includes(reporterGroup)) {
    return res.status(400).json({
      error: 'Select whether you are from the Market, a Resident area, or University/Campus'
    });
  }

  if (
    locationDetails !== undefined &&
    locationDetails !== '' &&
    (
      typeof locationDetails !== 'string' ||
      locationDetails.trim().length < 2 ||
      locationDetails.trim().length > 160
    )
  ) {
    return res.status(400).json({
      error: 'Enter valid additional location details'
    });
  }

  if (
    typeof issueType !== 'string' ||
    issueType.trim().length < 2 ||
    issueType.trim().length > 80
  ) {
    return res.status(400).json({
      error: 'Enter a valid issue type'
    });
  }

  if (!['High', 'Medium', 'Low'].includes(urgency)) {
    return res.status(400).json({
      error: 'Select a valid urgency level'
    });
  }

  const reportDescription =
    typeof description === 'string' ? description.trim() : '';

  if (reportDescription.length > 2000) {
    return res.status(400).json({
      error: 'Description cannot exceed 2000 characters'
    });
  }

  if (reportDescription.length > 0 && reportDescription.length < 5) {
    return res.status(400).json({
      error: 'Description must contain at least 5 characters'
    });
  }

  let reportLocationId = null;
  let reportLocationName;
  let reportArea;

  if (locationId !== undefined && locationId !== '') {
    if (!isValidId(locationId)) {
      return res.status(400).json({
        error: 'Select a valid location'
      });
    }

    const location = await db.collection('locations')
      .findOne({ _id: locationId });

    if (!location) {
      return res.status(400).json({
        error: 'The selected location does not exist'
      });
    }

    const isMarketLocation =
      location.zone === 'Market' || /market/i.test(location.name || '');
    const locationMatchesGroup =
      reporterGroup === 'Market'
        ? isMarketLocation
        : reporterGroup === 'Resident'
          ? location.area === 'Village' && !isMarketLocation
          : location.area === 'Campus';

    if (!locationMatchesGroup) {
      return res.status(400).json({
        error: 'Choose a location that matches the selected community group'
      });
    }

    reportLocationId = locationId;
    reportLocationName = location.name;
    reportArea = location.area;
  } else {
    if (
      typeof locationName !== 'string' ||
      locationName.trim().length < 2 ||
      locationName.trim().length > 120
    ) {
      return res.status(400).json({
        error: 'Enter an area name (2 to 120 characters)'
      });
    }

    reportLocationName = locationName.trim();
    reportArea = reporterGroup === 'Market'
      ? 'Market'
      : reporterGroup === 'Resident'
        ? 'Village'
        : 'Campus';
  }

  const reporterId = await nextId(db, 'reporters');
  const reportId = await nextId(db, 'reports');
  const now = new Date();

  // Generate a private tracking token.
  const trackingToken = crypto.randomBytes(32).toString('hex');

  // Store only the token hash in MongoDB.
  const trackingTokenHash = hashTrackingToken(trackingToken);

  const reporter = {
    _id: reporterId,
    name: reporterName.trim(),
    role: reporterGroup,
    affiliation: reporterGroup,
    phone: reporterPhone ? reporterPhone.trim() : '',
    createdAt: now
  };

  const report = {
    _id: reportId,
    locationId: reportLocationId,
    locationName: reportLocationName,
    area: reportArea,
    locationDetails:
      typeof locationDetails === 'string' &&
      locationDetails.trim() !== reportLocationName
        ? locationDetails.trim()
        : '',
    reporterGroup,
    reporterId,
    issueType: issueType.trim(),
    urgency,
    description: reportDescription,
    status: 'open',
    reportedAt: now,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    trackingTokenHash,
    activity: [
      trackingActivity(
        'Report submitted',
        'Your report has been received and is awaiting review.',
        now
      )
    ]
  };

  try {
    await db.collection('reporters').insertOne(reporter);
    await db.collection('reports').insertOne(report);
  } catch (error) {
    await db.collection('reporters')
      .deleteOne({ _id: reporterId })
      .catch(() => {});

    throw error;
  }

  return res.set('Cache-Control', 'no-store').status(201).json({
    message: 'Your report has been submitted successfully',
    reportId,
    trackingToken
  });
}));

// ==========================================
// PRIVATE REPORT TRACKING
// ==========================================

app.post('/api/reports/track', asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const body = req.body || {};
  const token = body.token;
  let report = null;

  if (typeof token === 'string' && /^[a-f0-9]{64}$/i.test(token)) {
    const trackingTokenHash = hashTrackingToken(token);
    report = await db.collection('reports').findOne({ trackingTokenHash });
  }

  if (
    !report &&
    isValidId(body.reportId) &&
    typeof body.reporterName === 'string' &&
    body.reporterName.trim().length >= 2 &&
    body.reporterName.trim().length <= 80
  ) {
    const candidate = await db.collection('reports').findOne({
      _id: body.reportId
    });

    if (candidate) {
      const reporter = await db.collection('reporters').findOne(
        { _id: candidate.reporterId },
        { projection: { name: 1 } }
      );

      if (
        reporter &&
        typeof reporter.name === 'string' &&
        reporter.name.trim().toLocaleLowerCase() ===
          body.reporterName.trim().toLocaleLowerCase()
      ) {
        report = candidate;
      }
    }
  }

  if (!report) {
    return res.status(404).json({
      error: 'Report not found. Check the report number and the name used when submitting it.'
    });
  }

  const [location, team] = await Promise.all([
    db.collection('locations').findOne(
      { _id: report.locationId },
      {
        projection: {
          _id: 1,
          name: 1,
          area: 1,
          zone: 1
        }
      }
    ),

    report.assignedTeamId
      ? db.collection('teams').findOne(
          { _id: report.assignedTeamId },
          {
            projection: {
              _id: 1,
              name: 1,
              organization: 1
            }
          }
        )
      : Promise.resolve(null)
  ]);

  const safeReport = {
    _id: report._id,
    reportNumber: report._id,
    issueType: report.issueType,
    urgency: report.urgency,
    description: report.description || '',
    status: report.status || 'open',

    location: location
      ? {
          _id: location._id,
          name: location.name,
          area: location.area,
          zone: location.zone
        }
      : report.locationName
        ? {
            name: report.locationName,
            area: report.area || '',
            zone: ''
          }
        : null,

    locationDetails: report.locationDetails || '',

    assignedTeam: team
      ? {
          _id: team._id,
          name: team.name,
          organization: team.organization
        }
      : null,

    createdAt: report.createdAt || report.reportedAt || null,
    reportedAt: report.reportedAt || report.createdAt || null,
    updatedAt: report.updatedAt || report.createdAt || report.reportedAt || null,
    resolvedAt: report.resolvedAt || null,

    activity: Array.isArray(report.activity)
      ? report.activity
      : []
  };

  return res.json({
    report: safeReport
  });
}));

// ==========================================
// ADMINISTRATOR CRUD
// ==========================================

function allowedFields(name) {
  const fields = {
    locations: [
      'name',
      'zone',
      'area',
      'binCount',
      'description'
    ],

    teams: [
      'name',
      'organization',
      'supervisor',
      'phone',
      'shift',
      'members',
      'zones'
    ],

    reporters: [
      'name',
      'role',
      'affiliation',
      'phone'
    ],

    reports: [
      'locationId',
      'locationName',
      'area',
      'reporterId',
      'assignedTeamId',
      'issueType',
      'urgency',
      'description',
      'status',
      'reportedAt',
      'resolvedAt'
    ],

    collectionLogs: [
      'locationId',
      'teamId',
      'scheduledFor',
      'status',
      'wasteType',
      'note'
    ]
  };

  return fields[name] || [];
}

function cleanInput(name, body) {
  const result = {};

  for (const field of allowedFields(name)) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      result[field] = body[field];
    }
  }

  return fixDates(name, result);
}

function registerCollectionRoutes(name, adminOnly) {
  const collection = db.collection(name);

  // GET ALL
  app.get(`/api/${name}`, ...adminOnly, asyncRoute(async (req, res) => {
    const pipeline = [...joinStages(name)];

    if (name === 'reports') {
      const match = {};

      if (typeof req.query.status === 'string' && req.query.status) {
        match.status = req.query.status;
      }

      if (typeof req.query.area === 'string' && req.query.area) {
        match.area = req.query.area;
      }

      if (Object.keys(match).length) {
        pipeline.push({ $match: match });
      }
    }

    pipeline.push({ $sort: { _id: 1 } });

    const records = await collection.aggregate(pipeline).toArray();

    res.json(records);
  }));

  // GET ONE
  app.get(`/api/${name}/:id`, ...adminOnly, asyncRoute(async (req, res) => {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({
        error: 'Invalid id'
      });
    }

    const records = await collection.aggregate([
      { $match: { _id: req.params.id } },
      ...joinStages(name)
    ]).toArray();

    if (!records.length) {
      return res.status(404).json({
        error: 'Not found'
      });
    }

    res.json(records[0]);
  }));

  // CREATE
  app.post(`/api/${name}`, ...adminOnly, asyncRoute(async (req, res) => {
    const body = cleanInput(name, req.body || {});

    const validationError = validate(name, body, true);

    if (validationError) {
      return res.status(400).json({
        error: validationError
      });
    }

    if (name === 'reports') {
      const [location, reporter] = await Promise.all([
        db.collection('locations').findOne({
          _id: body.locationId
        }),

        db.collection('reporters').findOne({
          _id: body.reporterId
        })
      ]);

      if (!location || !reporter) {
        return res.status(400).json({
          error: 'Selected location or reporter does not exist'
        });
      }

      if (body.assignedTeamId) {
        const team = await db.collection('teams').findOne({
          _id: body.assignedTeamId
        });

        if (!team) {
          return res.status(400).json({
            error: 'Selected team does not exist'
          });
        }
      }

      if (body.assignedTeamId === '') {
        body.assignedTeamId = null;
      }

      const now = new Date();

      body.createdAt = now;
      body.updatedAt = now;

      body.activity = [
        trackingActivity(
          'Report recorded',
          'The report was added by the administrator.',
          now
        )
      ];
    }

    if (name === 'collectionLogs') {
      const [location, team] = await Promise.all([
        db.collection('locations').findOne({
          _id: body.locationId
        }),

        db.collection('teams').findOne({
          _id: body.teamId
        })
      ]);

      if (!location || !team) {
        return res.status(400).json({
          error: 'Selected location or team does not exist'
        });
      }
    }

    body._id = await nextId(db, name);

    if (!body.createdAt) {
      body.createdAt = new Date();
    }

    await collection.insertOne(body);

    res.status(201).json(body);
  }));

  // UPDATE
  app.put(`/api/${name}/:id`, ...adminOnly, asyncRoute(async (req, res) => {
    const id = req.params.id;

    if (!isValidId(id)) {
      return res.status(400).json({
        error: 'Invalid record ID'
      });
    }

    const body = cleanInput(name, req.body || {});

    if (Object.keys(body).length === 0) {
      return res.status(400).json({
        error: 'No valid fields provided for update'
      });
    }

    const validationError = validate(name, body, false);

    if (validationError) {
      return res.status(400).json({
        error: validationError
      });
    }

    if (name === 'reports') {
      if (body.locationId) {
        const location = await db.collection('locations').findOne({
          _id: body.locationId
        });

        if (!location) {
          return res.status(400).json({
            error: 'Selected location does not exist'
          });
        }
      }

      if (body.reporterId) {
        const reporter = await db.collection('reporters').findOne({
          _id: body.reporterId
        });

        if (!reporter) {
          return res.status(400).json({
            error: 'Selected reporter does not exist'
          });
        }
      }

      if (body.assignedTeamId === '') {
        body.assignedTeamId = null;
      }

      if (body.assignedTeamId) {
        const team = await db.collection('teams').findOne({
          _id: body.assignedTeamId
        });

        if (!team) {
          return res.status(400).json({
            error: 'Selected team does not exist'
          });
        }
      }

      if (body.status === 'resolved') {
        body.resolvedAt = new Date();
      } else if (body.status && body.status !== 'resolved') {
        body.resolvedAt = null;
      }

      const previous = await collection.findOne(
        { _id: id },
        {
          projection: {
            status: 1,
            assignedTeamId: 1,
            urgency: 1
          }
        }
      );

      if (!previous) {
        return res.status(404).json({
          error: 'Record not found'
        });
      }

      const now = new Date();
      const activityEntries = [];

      if (
        body.status !== undefined &&
        body.status !== previous.status
      ) {
        const labels = {
          open: 'Open',
          assigned: 'Assigned',
          'in-progress': 'In Progress',
          resolved: 'Resolved'
        };

        const newLabel = labels[body.status] || body.status;

        activityEntries.push(
          trackingActivity(
            newLabel,
            body.status === 'resolved'
              ? 'Your report has been marked as resolved. Thank you for helping keep the community clean.'
              : `Your report status has been updated to ${newLabel}.`,
            now
          )
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(body, 'assignedTeamId') &&
        body.assignedTeamId !== previous.assignedTeamId
      ) {
        let teamName = 'No team';

        if (body.assignedTeamId) {
          const team = await db.collection('teams').findOne(
            { _id: body.assignedTeamId },
            {
              projection: { name: 1 }
            }
          );

          teamName = team ? team.name : 'Assigned team';
        }

        activityEntries.push(
          trackingActivity(
            body.assignedTeamId
              ? 'Cleaning team assigned'
              : 'Team assignment updated',

            body.assignedTeamId
              ? `Your report has been assigned to ${teamName}.`
              : 'The cleaning team assignment has been removed.',

            now
          )
        );
      }

      if (
        body.urgency !== undefined &&
        body.urgency !== previous.urgency
      ) {
        activityEntries.push(
          trackingActivity(
            'Urgency updated',
            `The report urgency has been changed to ${body.urgency}.`,
            now
          )
        );
      }

      const update = {
        $set: {
          ...body,
          updatedAt: now
        }
      };

      if (activityEntries.length) {
        update.$push = {
          activity: {
            $each: activityEntries
          }
        };
      }

      const result = await collection.updateOne(
        { _id: id },
        update
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          error: 'Record not found'
        });
      }

      return res.json({
        message: 'Record updated successfully'
      });
    }

    const result = await collection.updateOne(
      { _id: id },
      {
        $set: {
          ...body,
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        error: 'Record not found'
      });
    }

    res.json({
      message: 'Record updated successfully'
    });
  }));

  // DELETE
  app.delete(`/api/${name}/:id`, ...adminOnly, asyncRoute(async (req, res) => {
    const id = req.params.id;

    if (!isValidId(id)) {
      return res.status(400).json({
        error: 'Invalid record ID'
      });
    }

    const references = REFERENCES[name] || [];

    for (const [otherCollection, field] of references) {
      const used = await db.collection(otherCollection).findOne({
        [field]: id
      });

      if (used) {
        return res.status(409).json({
          error: `This record is still being used by ${otherCollection}`
        });
      }
    }

    const result = await collection.deleteOne({
      _id: id
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        error: 'Record not found'
      });
    }

    res.json({
      message: 'Record deleted successfully'
    });
  }));
}

// ==========================================
// START SERVER
// ==========================================

async function startServer() {
  const client = new MongoClient(MONGO_URI);

  await client.connect();

  db = client.db('bugemaClean');

  console.log(
    'Connected to MongoDB database:',
    db.databaseName
  );

  // Authentication routes.
  app.use('/api/auth', authRoutes(db));

  const adminOnly = [
    requireAuth(db),
    requireAdmin
  ];

  // Dashboard statistics.
  registerStats(app, db);

  // Register administrator collection routes.
  for (const name of collections) {
    registerCollectionRoutes(name, adminOnly);
  }

  // Public home page.
  app.get('/', (req, res) => {
    res.sendFile(
      path.join(__dirname, 'public', 'home.html')
    );
  });

  // Frontend static files.
  app.use(express.static(
    path.join(__dirname, 'public')
  ));

  // Unknown API routes.
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: 'API route not found'
    });
  });

  // Central error handler.
  app.use((error, req, res, next) => {
    console.error('Server error:', error);

    if (res.headersSent) {
      return next(error);
    }

    res.status(500).json({
      error: 'An unexpected server error occurred'
    });
  });

  app.listen(PORT, () => {
    console.log(
      `Bugema Clean Community Tracker running at http://localhost:${PORT}`
    );
  });
}

startServer().catch(error => {
  console.error('Could not start server:', error);
  process.exit(1);
});