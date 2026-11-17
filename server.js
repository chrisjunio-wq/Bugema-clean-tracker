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
const LOCATION_TYPES = [
  'University / Campus',
  'Resident',
  'Market',
  'Trading Centre',
  'Roadside / Service Area'
];

// --------------------------------------------------
// Environment checks
// --------------------------------------------------

if (!MONGO_URI) {
  console.error('MONGO_URI is missing from your environment settings.');
  process.exit(1);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be configured with at least 32 characters.');
  process.exit(1);
}

// --------------------------------------------------
// Basic Express configuration
// --------------------------------------------------

app.disable('x-powered-by');

app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({
  extended: false,
  limit: '20kb'
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  return next();
});

let db;

// These collections are managed by the staff portal.
const collections = [
  'locations',
  'teams',
  'reporters',
  'reports',
  'collectionLogs'
];

// --------------------------------------------------
// Helper: validate internal IDs
// --------------------------------------------------

function isValidId(value) {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 30;
}

// --------------------------------------------------
// Helper: expose safe location information
// --------------------------------------------------

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

// --------------------------------------------------
// Helper: async route wrapper
// --------------------------------------------------

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

const reportSubmissions = new Map();

function limitPublicReportSubmissions(req, res, next) {
  const now = Date.now();
  const key = req.ip;
  let entry = reportSubmissions.get(key);

  if (!entry || entry.expiresAt <= now) {
    entry = {
      count: 0,
      expiresAt: now + 15 * 60 * 1000
    };
    reportSubmissions.set(key, entry);
  }

  if (entry.count >= 30) {
    res.setHeader(
      'Retry-After',
      String(Math.ceil((entry.expiresAt - now) / 1000))
    );
    return res.status(429).json({
      error: 'Too many reports from this network. Please try again later.'
    });
  }

  entry.count += 1;

  if (reportSubmissions.size > 10000) {
    for (const [ip, attempt] of reportSubmissions) {
      if (attempt.expiresAt <= now) reportSubmissions.delete(ip);
    }
  }

  return next();
}

// --------------------------------------------------
// Helper: build list filters from the query string
// --------------------------------------------------

function buildFilters(name, query) {
  const pre = {};
  const post = {};

  const simpleFilters = {
    locations: [],
    teams: ['organization'],
    reporters: ['affiliation'],
    reports: ['status', 'urgency'],
    collectionLogs: ['status']
  };

  for (const field of simpleFilters[name] || []) {
    const value = query[field];

    if (typeof value === 'string' && value !== '') {
      pre[field] = value;
    }
  }

  const area = query.area;
  const reportConditions = [];

  if (typeof area === 'string' && area !== '') {
    if (name === 'locations') {
      pre.area = area;
    }

    if (name === 'collectionLogs') {
      post.area = area;
    }

    if (name === 'reports') {
      if (area === 'Campus') {
        reportConditions.push({
          $or: [
          { area: 'Campus' },
          { locationType: 'University / Campus' }
          ]
        });
      } else if (area === 'Village') {
        reportConditions.push({
          $or: [
          { area: 'Village' },
          { locationType: { $in: LOCATION_TYPES.slice(1) } }
          ]
        });
      }
    }
  }

  if (name === 'reports') {
    const locationId = query.locationId;
    if (typeof locationId === 'string' && locationId.length <= 30) {
      pre.locationId = locationId;
    }

    const from = typeof query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.from)
      ? new Date(`${query.from}T00:00:00.000Z`)
      : null;
    const to = typeof query.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.to)
      ? new Date(`${query.to}T00:00:00.000Z`)
      : null;

    if (
      (from && !Number.isNaN(from.getTime())) ||
      (to && !Number.isNaN(to.getTime()))
    ) {
      pre.reportedAt = {};
      if (from && !Number.isNaN(from.getTime())) {
        pre.reportedAt.$gte = from;
      }
      if (to && !Number.isNaN(to.getTime())) {
        to.setUTCDate(to.getUTCDate() + 1);
        pre.reportedAt.$lt = to;
      }
    }

    const search = typeof query.search === 'string'
      ? query.search.trim().slice(0, 100)
      : '';
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, 'i');
      reportConditions.push({
        $or: [
          { _id: pattern },
          { issueType: pattern },
          { description: pattern },
          { locationDetails: pattern },
          { locationName: pattern },
          { reporterName: pattern },
          { teamName: pattern }
        ]
      });
    }

    if (reportConditions.length) {
      post.$and = reportConditions;
    }
  }

  return { pre, post };
}

// ==================================================
// PUBLIC ROUTES
// ==================================================

// --------------------------------------------------
// Health check
// --------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok'
  });
});

// --------------------------------------------------
// Public locations
//
// These are existing organization-managed locations.
// They are NOT used to force a public report to match
// a predefined location.
// --------------------------------------------------

app.get('/api/locations', asyncRoute(async (req, res) => {
    const { pre } = buildFilters('locations', req.query);

  const locations = await db.collection('locations')
    .find(pre)
    .sort({ name: 1 })
    .toArray();

  res.json(locations.map(publicLocation));
}));

// ==================================================
// PUBLIC REPORT SUBMISSION
// ==================================================

app.post('/api/reports', limitPublicReportSubmissions, asyncRoute(async (req, res) => {
  const {
    reporterName,
    reporterPhone,
    locationType,
    locationDetails,
    issueType,
    urgency,
    description
  } = req.body || {};

  // ------------------------------------------------
  // Validate reporter name
  // ------------------------------------------------

  if (
    typeof reporterName !== 'string' ||
    reporterName.trim().length < 2 ||
    reporterName.trim().length > 80
  ) {
    return res.status(400).json({
      error: 'Enter a valid reporter name'
    });
  }

  // ------------------------------------------------
  // Validate phone
  // ------------------------------------------------

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

  // ------------------------------------------------
  // Validate location type
  // ------------------------------------------------

  if (!LOCATION_TYPES.includes(locationType)) {
    return res.status(400).json({
      error: 'Select a valid service location type'
    });
  }

  // ------------------------------------------------
  // Validate exact location details
  // ------------------------------------------------

  if (
    typeof locationDetails !== 'string' ||
    locationDetails.trim().length < 3 ||
    locationDetails.trim().length > 150
  ) {
    return res.status(400).json({
      error: 'Enter the exact location where the service is needed'
    });
  }

  // ------------------------------------------------
  // Validate issue type
  // ------------------------------------------------

  if (
    typeof issueType !== 'string' ||
    issueType.trim().length < 2 ||
    issueType.trim().length > 80
  ) {
    return res.status(400).json({
      error: 'Enter a valid issue type'
    });
  }

  // ------------------------------------------------
  // Validate urgency
  // ------------------------------------------------

  if (!['High', 'Medium', 'Low'].includes(urgency)) {
    return res.status(400).json({
      error: 'Select a valid urgency level'
    });
  }

  // ------------------------------------------------
  // Clean and validate description
  // ------------------------------------------------

  const reportDescription =
    typeof description === 'string'
      ? description.trim()
      : '';

  if (reportDescription.length > 2000) {
    return res.status(400).json({
      error: 'Description cannot exceed 2000 characters'
    });
  }

  if (
    reportDescription.length > 0 &&
    reportDescription.length < 5
  ) {
    return res.status(400).json({
      error: 'Description must contain at least 5 characters'
    });
  }

  // ------------------------------------------------
  // Generate internal IDs
  // ------------------------------------------------

  const reporterId = await nextId(db, 'reporters');
  const reportId = await nextId(db, 'reports');

  // ------------------------------------------------
  // Generate private tracking token
  //
  // The actual token is returned to the user.
  // Only its SHA-256 hash is stored in MongoDB.
  // ------------------------------------------------

  const trackingToken = crypto
    .randomBytes(32)
    .toString('hex');

  const trackingTokenHash = crypto
    .createHash('sha256')
    .update(trackingToken)
    .digest('hex');

  const now = new Date();
  const managedArea = locationType === 'University / Campus'
    ? 'Campus'
    : 'Village';
  const managedLocation = await db.collection('locations').findOne(
    {
      name: locationDetails.trim(),
      area: managedArea
    },
    {
      collation: { locale: 'en', strength: 2 }
    }
  );

  // ------------------------------------------------
  // Create reporter record
  // ------------------------------------------------

  const reporter = {
    _id: reporterId,
    name: reporterName.trim(),
    role: 'Community member',
    affiliation: 'Community',
    phone: reporterPhone
      ? reporterPhone.trim()
      : '',
    createdAt: now
  };

  // ------------------------------------------------
  // Create report record
  //
  // locationId is kept for compatibility with the
  // existing database structure, but public users
  // are NOT required to choose an existing location.
  //
  // The actual location supplied by the user is stored
  // directly in locationType/locationDetails.
  // ------------------------------------------------

  const report = {
    _id: reportId,

    // Existing database relationship.
    // Public reports do not need to select a predefined
    // organization location.
    locationId: managedLocation ? managedLocation._id : null,

    // New public location information.
    locationType: locationType,
    locationDetails: locationDetails.trim(),

    reporterId: reporterId,

    assignedTeamId: null,

    issueType: issueType.trim(),

    urgency: urgency,

    description: reportDescription,

    trackingTokenHash: trackingTokenHash,

    status: 'open',

    reportedAt: now,

    resolvedAt: null
  };

  // ------------------------------------------------
  // Save reporter + report
  // ------------------------------------------------

  try {
    await db.collection('reporters')
      .insertOne(reporter);

    await db.collection('reports')
      .insertOne(report);

  } catch (error) {

    // If report creation fails after reporter creation,
    // remove the reporter so we don't leave orphan data.
    await db.collection('reporters')
      .deleteOne({
        _id: reporterId
      })
      .catch(() => {});

    throw error;
  }

  // ------------------------------------------------
  // Return private tracking link
  // ------------------------------------------------

  res.status(201).json({
    message: 'Your report has been submitted successfully',

    reportId: reportId,

    trackingUrl: `/track.html#${trackingToken}`
  });
}));

// ==================================================
// PRIVATE REPORT TRACKING
// ==================================================

app.post('/api/reports/track', asyncRoute(async (req, res) => {
  const {
    token
  } = req.body || {};

  // ------------------------------------------------
  // Validate token
  // ------------------------------------------------

  if (
    typeof token !== 'string' ||
    token.length < 20 ||
    token.length > 200
  ) {
    return res.status(400).json({
      error: 'Invalid tracking token'
    });
  }

  // ------------------------------------------------
  // Hash the supplied token
  // ------------------------------------------------

  const trackingTokenHash = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  // ------------------------------------------------
  // Find the report
  // ------------------------------------------------

  const report = await db.collection('reports')
    .findOne({
      trackingTokenHash
    });

  // Do not reveal whether another token/report exists.
  if (!report) {
    return res.status(404).json({
      error: 'Report not found'
    });
  }

  // ------------------------------------------------
  // Find linked organization location, if any
  // ------------------------------------------------

  let location = null;

  if (
    report.locationId &&
    isValidId(report.locationId)
  ) {
    location = await db.collection('locations')
      .findOne({
        _id: report.locationId
      });
  }

  // ------------------------------------------------
  // Return only information the public requester
  // needs to follow their own report.
  // ------------------------------------------------

  res.json({
    reportId: report._id,

    issueType: report.issueType,

    urgency: report.urgency,

    status: report.status,

    reportedAt: report.reportedAt,

    resolvedAt: report.resolvedAt,

    location:
      report.locationDetails ||
      (location ? location.name : 'Unknown'),

    locationType:
      report.locationType ||
      'University / Campus'
  });
}));

// ==================================================
// ADMIN / STAFF CRUD HELPERS
// ==================================================

function allowedFields(name) {
  const fields = {

    // ----------------------------------------------
    // Locations
    // ----------------------------------------------

    locations: [
      'name',
      'zone',
      'area',
      'binCount',
      'description'
    ],

    // ----------------------------------------------
    // Teams
    // ----------------------------------------------

    teams: [
      'name',
      'organization',
      'supervisor',
      'phone',
      'shift',
      'members',
      'zones'
    ],

    // ----------------------------------------------
    // Reporters
    // ----------------------------------------------

    reporters: [
      'name',
      'role',
      'affiliation',
      'phone'
    ],

    // ----------------------------------------------
    // Reports
    // ----------------------------------------------

    reports: [
      'locationId',

      // New public location fields.
      'locationType',
      'locationDetails',

      'reporterId',
      'assignedTeamId',
      'issueType',
      'urgency',
      'description',
      'status',
      'reportedAt',
      'resolvedAt'
    ],

    // ----------------------------------------------
    // Collection logs
    // ----------------------------------------------

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

// --------------------------------------------------
// Clean incoming admin data
// --------------------------------------------------

function cleanInput(name, body) {
  const result = {};

  for (const field of allowedFields(name)) {
    if (
      Object.prototype.hasOwnProperty.call(
        body,
        field
      )
    ) {
      result[field] = body[field];
    }
  }

  return fixDates(name, result);
}

// ==================================================
// ADMIN-ONLY COLLECTION ROUTES
// ==================================================

function registerCollectionRoutes(name, adminOnly) {
  const collection = db.collection(name);

  // ------------------------------------------------
  // LIST RECORDS
  // ------------------------------------------------

  app.get(
    `/api/${name}`,
    ...adminOnly,
    asyncRoute(async (req, res) => {

            const { pre, post } = buildFilters(name, req.query);

      const records = await collection
        .aggregate([
          { $match: pre },
          ...joinStages(name),
          { $match: post },
          { $sort: { _id: 1 } }
        ])
        .toArray();
      res.json(records);
    })
  );

  // ------------------------------------------------
  // READ ONE RECORD
  // ------------------------------------------------

  app.get(
    `/api/${name}/:id`,
    ...adminOnly,
    asyncRoute(async (req, res) => {

      if (!isValidId(req.params.id)) {
        return res.status(400).json({
          error: 'Invalid id'
        });
      }

      const records = await collection
        .aggregate([
          {
            $match: {
              _id: req.params.id
            }
          },

          ...joinStages(name)
        ])
        .toArray();

      if (!records.length) {
        return res.status(404).json({
          error: 'Not found'
        });
      }

      res.json(records[0]);
    })
  );

  // ------------------------------------------------
  // CREATE RECORD
  // ------------------------------------------------

  app.post(
    `/api/${name}`,
    ...adminOnly,
    asyncRoute(async (req, res) => {

      const body = cleanInput(
        name,
        req.body || {}
      );

      const validationError =
        validate(name, body, true);

      if (validationError) {
        return res.status(400).json({
          error: validationError
        });
      }

      // --------------------------------------------
      // Validate report references
      // --------------------------------------------

      if (name === 'reports') {

        // Only validate location when an admin
        // actually supplies a locationId.
        if (body.locationId) {

          const location =
            await db.collection('locations')
              .findOne({
                _id: body.locationId
              });

          if (!location) {
            return res.status(400).json({
              error:
                'Selected location does not exist'
            });
          }
        }

        const reporter =
          await db.collection('reporters')
            .findOne({
              _id: body.reporterId
            });

        if (!reporter) {
          return res.status(400).json({
            error:
              'Selected reporter does not exist'
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

        // If an admin creates a report manually,
        // make sure the new location fields are valid
        // when supplied.
        if (
          body.locationType &&
          !LOCATION_TYPES.includes(body.locationType)
        ) {
          return res.status(400).json({
            error:
              'Invalid report location type'
          });
        }

        if (
          body.locationDetails &&
          (
            typeof body.locationDetails !== 'string' ||
            body.locationDetails.trim().length < 3 ||
            body.locationDetails.trim().length > 150
          )
        ) {
          return res.status(400).json({
            error:
              'Invalid report location details'
          });
        }
      }

      if (name === 'locations') {
        const duplicateLocation = await collection.findOne(
          {
            name: body.name.trim(),
            area: body.area
          },
          {
            collation: { locale: 'en', strength: 2 }
          }
        );

        if (duplicateLocation) {
          return res.status(409).json({
            error: 'A location with this name already exists in this area'
          });
        }
      }

      // --------------------------------------------
      // Validate collection log references
      // --------------------------------------------

      if (name === 'collectionLogs') {

        const location =
          await db.collection('locations')
            .findOne({
              _id: body.locationId
            });

        const team =
          await db.collection('teams')
            .findOne({
              _id: body.teamId
            });

        if (!location || !team) {
          return res.status(400).json({
            error:
              'Selected location or team does not exist'
          });
        }
      }

      // --------------------------------------------
      // Generate ID + creation date
      // --------------------------------------------

      body._id = await nextId(db, name);
      body.createdAt = new Date();

      if (name === 'reports') {
        const now = new Date();
        body.reportedAt = body.reportedAt || now;
        body.status = body.status || 'open';

        if (body.assignedTeamId) {
          body.assignmentReceivedAt = now;
          if (body.status === 'open') body.status = 'assigned';
        }

        if (body.status === 'in-progress') body.workStartedAt = now;
        if (body.status === 'resolved') {
          body.workStartedAt = now;
          body.workFinishedAt = now;
          body.resolvedAt = now;
        } else {
          body.resolvedAt = body.resolvedAt || null;
        }
      }

      if (name === 'collectionLogs' && body.status === 'collected') {
        body.completedAt = new Date();
      }

      await collection.insertOne(body);

      res.status(201).json(body);
    })
  );

  // ------------------------------------------------
  // UPDATE RECORD
  // ------------------------------------------------

  app.put(
    `/api/${name}/:id`,
    ...adminOnly,
    asyncRoute(async (req, res) => {

      const id = req.params.id;

      if (!isValidId(id)) {
        return res.status(400).json({
          error: 'Invalid record ID'
        });
      }

      const body = cleanInput(
        name,
        req.body || {}
      );

      if (Object.keys(body).length === 0) {
        return res.status(400).json({
          error:
            'No valid fields provided for update'
        });
      }

      const existingReport = name === 'reports'
        ? await collection.findOne({ _id: id })
        : null;
      const existingLog = name === 'collectionLogs'
        ? await collection.findOne({ _id: id })
        : null;
      const existingLocation = name === 'locations'
        ? await collection.findOne({ _id: id })
        : null;

      if (name === 'reports' && !existingReport) {
        return res.status(404).json({
          error: 'Record not found'
        });
      }

      if (
        name === 'collectionLogs' &&
        !existingLog
      ) {
        return res.status(404).json({
          error: 'Record not found'
        });
      }

      if (name === 'locations' && !existingLocation) {
        return res.status(404).json({
          error: 'Record not found'
        });
      }

      if (name === 'locations') {
        const duplicateLocation = await collection.findOne(
          {
            _id: { $ne: id },
            name: (body.name || existingLocation.name).trim(),
            area: body.area || existingLocation.area
          },
          {
            collation: { locale: 'en', strength: 2 }
          }
        );

        if (duplicateLocation) {
          return res.status(409).json({
            error: 'A location with this name already exists in this area'
          });
        }
      }

      if (name === 'reports' && body.assignedTeamId === '') {
        body.assignedTeamId = null;
      }

      if (name === 'reports' && body.locationId === '') {
        body.locationId = null;
      }

      if (
        name === 'reports' &&
        Object.hasOwn(body, 'reporterId') &&
        !body.reporterId
      ) {
        return res.status(400).json({
          error: 'A report must reference a reporter'
        });
      }

      if (
        name === 'collectionLogs' &&
        (!body.locationId && Object.hasOwn(body, 'locationId') ||
          !body.teamId && Object.hasOwn(body, 'teamId'))
      ) {
        return res.status(400).json({
          error: 'Collection logs must reference a location and team'
        });
      }

      // --------------------------------------------
      // Report-specific validation
      // --------------------------------------------

      if (name === 'reports') {

        if (body.locationId) {

          const location =
            await db.collection('locations')
              .findOne({
                _id: body.locationId
              });

          if (!location) {
            return res.status(400).json({
              error:
                'Selected location does not exist'
            });
          }
        }

        if (body.reporterId !== undefined) {

          const reporter =
            await db.collection('reporters')
              .findOne({
                _id: body.reporterId
              });

          if (!reporter) {
            return res.status(400).json({
              error:
                'Selected reporter does not exist'
            });
          }
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

        if (
          body.locationType &&
          !LOCATION_TYPES.includes(body.locationType)
        ) {
          return res.status(400).json({
            error:
              'Invalid report location type'
          });
        }

        if (
          body.locationDetails &&
          (
            typeof body.locationDetails !== 'string' ||
            body.locationDetails.trim().length < 3 ||
            body.locationDetails.trim().length > 150
          )
        ) {
          return res.status(400).json({
            error:
              'Invalid report location details'
          });
        }
      }

      // --------------------------------------------
      // General validation
      // --------------------------------------------

      const validationError =
        validate(name, body, false);

      if (validationError) {
        return res.status(400).json({
          error: validationError
        });
      }

      // --------------------------------------------
      // Automatically set resolvedAt when a report
      // becomes resolved.
      // --------------------------------------------

      if (
        name === 'reports' &&
        body.status === 'resolved' &&
        !body.resolvedAt
      ) {
        body.resolvedAt = new Date();
      }

      if (name === 'reports') {
        const now = new Date();

        if (
          body.assignedTeamId !== undefined &&
          body.assignedTeamId !== existingReport.assignedTeamId
        ) {
          body.assignmentReceivedAt = body.assignedTeamId
            ? now
            : null;
        }

        if (body.assignedTeamId && body.status === 'open') {
          body.status = 'assigned';
        }

        if (
          body.status === 'in-progress' &&
          (
            !existingReport.workStartedAt ||
            existingReport.status !== 'in-progress'
          )
        ) {
          body.workStartedAt = now;
        }

        if (
          body.status === 'resolved' &&
          (
            !existingReport.workFinishedAt ||
            existingReport.status !== 'resolved'
          )
        ) {
          if (!existingReport.workStartedAt) {
            body.workStartedAt = now;
          }
          body.workFinishedAt = now;
        }
      }

      if (name === 'collectionLogs') {
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

        if (body.teamId) {
          const team = await db.collection('teams').findOne({
            _id: body.teamId
          });

          if (!team) {
            return res.status(400).json({
              error: 'Selected team does not exist'
            });
          }
        }

        if (body.status === 'collected') {
          body.completedAt = existingLog.completedAt || new Date();
        } else if (body.status === 'missed') {
          body.completedAt = null;
        }
      }

      // If status is changed away from resolved,
      // remove the resolved date.
      if (
        name === 'reports' &&
        body.status &&
        body.status !== 'resolved'
      ) {
        body.resolvedAt = null;
        body.workFinishedAt = null;
      }

      const result =
        await collection.updateOne(
          {
            _id: id
          },
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
        message:
          'Record updated successfully'
      });
    })
  );

  // ------------------------------------------------
  // DELETE RECORD
  // ------------------------------------------------

  app.delete(
    `/api/${name}/:id`,
    ...adminOnly,
    asyncRoute(async (req, res) => {

      const id = req.params.id;

      if (!isValidId(id)) {
        return res.status(400).json({
          error: 'Invalid record ID'
        });
      }

      // --------------------------------------------
      // Protect records referenced by other
      // collections.
      // --------------------------------------------

      const references =
        REFERENCES[name] || [];

      for (
        const [
          otherCollection,
          field
        ] of references
      ) {

        const used =
          await db.collection(otherCollection)
            .findOne({
              [field]: id
            });

        if (used) {
          return res.status(409).json({
            error:
              `This record is still being used by ${otherCollection}`
          });
        }
      }

      const result =
        await collection.deleteOne({
          _id: id
        });

      if (result.deletedCount === 0) {
        return res.status(404).json({
          error: 'Record not found'
        });
      }

      res.json({
        message:
          'Record deleted successfully'
      });
    })
  );
}

// ==================================================
// START SERVER
// ==================================================

async function startServer() {

  const client =
    new MongoClient(MONGO_URI);

  await client.connect();

  db = client.db('bugemaClean');

  await Promise.all([
    db.collection('reports').createIndex(
      { trackingTokenHash: 1 },
      {
        unique: true,
        partialFilterExpression: {
          trackingTokenHash: { $type: 'string' }
        },
        name: 'unique_tracking_token_hash'
      }
    ),
    db.collection('reports').createIndex(
      { status: 1, reportedAt: -1 },
      { name: 'reports_status_date' }
    ),
    db.collection('reports').createIndex(
      { locationId: 1, status: 1 },
      { name: 'reports_location_status' }
    ),
    db.collection('reports').createIndex(
      { assignedTeamId: 1, status: 1 },
      { name: 'reports_team_status' }
    ),
    db.collection('locations').createIndex(
      { area: 1, name: 1 },
      { name: 'locations_area_name' }
    ),
    db.collection('collectionLogs').createIndex(
      { scheduledFor: -1, status: 1 },
      { name: 'collection_logs_date_status' }
    ),
    db.collection('users').createIndex(
      { email: 1 },
      { unique: true }
    )
  ]);

  console.log(
    'Connected to MongoDB database:',
    db.databaseName
  );

  // ------------------------------------------------
  // Authentication routes
  // ------------------------------------------------

  app.use(
    '/api/auth',
    authRoutes(db)
  );

  // ------------------------------------------------
  // Staff/admin protection
  //
  // Public routes are defined above and do not use
  // this middleware.
  // ------------------------------------------------

  const adminOnly = [
    requireAuth(db),
    requireAdmin
  ];

  // ------------------------------------------------
  // Dashboard statistics
  // ------------------------------------------------

  registerStats(app, db);

  // ------------------------------------------------
  // Register CRUD routes
  // ------------------------------------------------

  for (const name of collections) {
    registerCollectionRoutes(
      name,
      adminOnly
    );
  }

  // ------------------------------------------------
  // Serve frontend
  // ------------------------------------------------

  app.use(
    express.static(
      path.join(__dirname, 'public')
    )
  );

  // ------------------------------------------------
  // Unknown API routes
  // ------------------------------------------------

  app.use(
    '/api',
    (req, res) => {
      res.status(404).json({
        error: 'API route not found'
      });
    }
  );

  // ------------------------------------------------
  // Central error handler
  // ------------------------------------------------

  app.use(
    (error, req, res, next) => {

      console.error(
        'Server error:',
        error
      );

      if (res.headersSent) {
        return next(error);
      }

      res.status(500).json({
        error:
          'An unexpected server error occurred'
      });
    }
  );

  // ------------------------------------------------
  // Start listening
  // ------------------------------------------------

  app.listen(PORT, () => {

    console.log(
      `Bugema Clean Community Tracker running at http://localhost:${PORT}`
    );
  });
}

// --------------------------------------------------
// Start application
// --------------------------------------------------

startServer()
  .catch(error => {

    console.error(
      'Could not start server:',
      error
    );

    process.exit(1);
  });