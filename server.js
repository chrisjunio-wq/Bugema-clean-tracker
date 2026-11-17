
'use strict';

require('dotenv').config();

const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');
const { MongoClient, ObjectId } = require('mongodb');

const { requireAuth, requireAdmin } = require('./auth');
const authRoutes = require('./routes-auth');
const registerStats = require('./stats');

const {
  validate,
  REPORT_STATUSES,
  CLOSED_REPORT_STATUSES
} = require('./helpers');

const app = express();

const PORT = Number(process.env.PORT || 3000);
const DATABASE_NAME = process.env.DB_NAME || 'bugemaClean';
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  throw new Error('MONGO_URI is required.');
}

if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32
) {
  throw new Error('JWT_SECRET must contain at least 32 characters.');
}

if (
  !/^\/[a-zA-Z0-9/_-]+$/.test(ADMIN_PATH) ||
  ADMIN_PATH === '/'
) {
  throw new Error('ADMIN_PATH must be a valid private route.');
}

app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY || 0));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

const client = new MongoClient(mongoUri, {
  maxPoolSize: 20,
  serverSelectionTimeoutMS: 10000
});

let db;
let server;

function publicError(res, status, message) {
  return res.status(status).json({ error: message });
}

function safeObjectId(value) {
  if (!ObjectId.isValid(value) || String(new ObjectId(value)) !== String(value)) {
    return null;
  }

  return new ObjectId(value);
}

function normalizeText(value, maxLength = 500) {
  if (typeof value !== 'string') return '';

  return value.trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return normalizeText(value, 254).toLowerCase();
}

function normalizeStatus(value) {
  return normalizeText(value, 40).toLowerCase();
}

function publicLocation(location) {
  if (!location) return null;

  return {
    _id: String(location._id),
    name: location.name || '',
    zone: location.zone || '',
    area: location.area || ''
  };
}

function publicReport(report) {
  if (!report) return null;

  return {
    ...report,
    _id: String(report._id),
    trackingTokenHash: undefined
  };
}

function createTrackingToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashTrackingToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function addActivity(report, title, message, createdBy = 'System') {
  const activity = Array.isArray(report.activity)
    ? [...report.activity]
    : [];

  activity.push({
    title,
    message,
    createdBy,
    createdAt: new Date()
  });

  return activity.slice(-100);
}

async function findReportById(id) {
  const objectId = safeObjectId(id);
  if (!objectId) return null;

  return db.collection('reports').findOne({ _id: objectId });
}

async function getLocationDetails(locationId) {
  if (!locationId) return null;

  const objectId = safeObjectId(String(locationId));
  if (!objectId) return null;

  return db.collection('locations').findOne({ _id: objectId });
}

function requireAdminAccess() {
  return [requireAuth(db), requireAdmin];
}

function registerCollectionRoutes(collectionName, options = {}) {
  const collection = db.collection(collectionName);
  const route = `/api/${collectionName}`;

  app.get(route, async (req, res) => {
    try {
      const filter = {};

      if (collectionName === 'locations' && req.query.area) {
        filter.area = normalizeText(req.query.area, 100);
      }

      const records = await collection.find(filter)
        .sort({ createdAt: -1, name: 1 })
        .limit(500)
        .toArray();

      if (collectionName === 'locations') {
        return res.json(records.map(publicLocation));
      }

      return res.json(records.map(record => ({
        ...record,
        _id: String(record._id),
        passwordHash: undefined,
        trackingTokenHash: undefined
      })));
    } catch (error) {
      console.error(`${collectionName} list error:`, error.message);
      return publicError(res, 500, 'Unable to load records.');
    }
  });

  app.post(route, ...requireAdminAccess(), async (req, res) => {
    try {
      const body = { ...req.body };
      delete body._id;
      delete body.createdAt;
      delete body.updatedAt;
      delete body.passwordHash;
      delete body.trackingTokenHash;

      if (collectionName === 'reports') {
        return publicError(
          res,
          405,
          'Use the administrator report creation endpoint.'
        );
      }

      const now = new Date();

      const record = {
        ...body,
        createdAt: now,
        updatedAt: now
      };

      const result = await collection.insertOne(record);

      return res.status(201).json({
        message: 'Record created.',
        record: {
          ...record,
          _id: String(result.insertedId)
        }
      });
    } catch (error) {
      console.error(`${collectionName} create error:`, error.message);
      return publicError(res, 500, 'Unable to create record.');
    }
  });

  app.put(`${route}/:id`, ...requireAdminAccess(), async (req, res) => {
    try {
      const id = safeObjectId(req.params.id);
      if (!id) return publicError(res, 400, 'Invalid record ID.');

      const changes = { ...req.body };

      for (const key of [
        '_id',
        'id',
        'createdAt',
        'updatedAt',
        'passwordHash',
        'trackingTokenHash',
        'role',
        'tokenVersion'
      ]) {
        delete changes[key];
      }

      if (collectionName === 'reports') {
        if (
          changes.status !== undefined &&
          !REPORT_STATUSES.includes(normalizeStatus(changes.status))
        ) {
          return publicError(res, 400, 'Invalid report status.');
        }

        const existing = await collection.findOne({ _id: id });
        if (!existing) return publicError(res, 404, 'Report not found.');

        const activityChanges = [];

        if (
          changes.status &&
          changes.status !== existing.status
        ) {
          activityChanges.push({
            title: 'Status updated',
            message: `Report status changed to ${changes.status}.`
          });

          if (changes.status === 'resolved') {
            changes.resolvedAt = new Date();
          } else if (changes.status !== 'rejected') {
            changes.resolvedAt = null;
          }
        }

        if (
          changes.urgency &&
          changes.urgency !== existing.urgency
        ) {
          activityChanges.push({
            title: 'Urgency updated',
            message: `Report urgency changed to ${changes.urgency}.`
          });
        }

        if (
          changes.assignedTeam !== undefined &&
          JSON.stringify(changes.assignedTeam) !==
            JSON.stringify(existing.assignedTeam)
        ) {
          activityChanges.push({
            title: 'Team assignment updated',
            message: 'The team assigned to your report has been updated.'
          });
        }

        let activity = Array.isArray(existing.activity)
          ? existing.activity
          : [];

        for (const item of activityChanges) {
          activity = addActivity(
            { activity },
            item.title,
            item.message,
            req.user.name || 'Administrator'
          );
        }

        if (activityChanges.length) {
          changes.activity = activity;
        }
      }

      if (collectionName === 'locations' && changes.name) {
        changes.name = normalizeText(changes.name, 150);
      }

      const result = await collection.findOneAndUpdate(
        { _id: id },
        {
          $set: {
            ...changes,
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      );

      const updated = result && result.value !== undefined
        ? result.value
        : result;

      if (!updated) return publicError(res, 404, 'Record not found.');

      return res.json({
        message: 'Record updated.',
        record: {
          ...updated,
          _id: String(updated._id)
        }
      });
    } catch (error) {
      console.error(`${collectionName} update error:`, error.message);
      return publicError(res, 500, 'Unable to update record.');
    }
  });

  app.delete(`${route}/:id`, ...requireAdminAccess(), async (req, res) => {
    try {
      const id = safeObjectId(req.params.id);
      if (!id) return publicError(res, 400, 'Invalid record ID.');

      const result = await collection.deleteOne({ _id: id });

      if (!result.deletedCount) {
        return publicError(res, 404, 'Record not found.');
      }

      return res.json({ message: 'Record deleted.' });
    } catch (error) {
      console.error(`${collectionName} delete error:`, error.message);
      return publicError(res, 500, 'Unable to delete record.');
    }
  });
}

async function createIndexes() {
  await db.collection('users').createIndex(
    { email: 1 },
    { unique: true }
  );

  await db.collection('reports').createIndex(
    { trackingTokenHash: 1 },
    {
      unique: true,
      partialFilterExpression: {
        trackingTokenHash: { $type: 'string' }
      }
    }
  );

  await db.collection('reports').createIndex({ createdAt: -1 });
  await db.collection('reports').createIndex({ status: 1 });
  await db.collection('reports').createIndex({ urgency: 1 });
  await db.collection('reports').createIndex({ dueDate: 1 });
  await db.collection('locations').createIndex({ name: 1 });
  await db.collection('teams').createIndex({ name: 1 });
  await db.collection('reporters').createIndex({ name: 1 });
  await db.collection('collectionLogs').createIndex({ createdAt: -1 });
}

function registerRoutes() {
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      application: 'Bugema Clean Community Tracker',
      timestamp: new Date().toISOString()
    });
  });

  app.use('/api/auth', authRoutes(db));

  app.get('/api/locations', async (req, res) => {
    try {
      const filter = {};

      if (req.query.area) {
        filter.area = normalizeText(req.query.area, 100);
      }

      const locations = await db.collection('locations')
        .find(filter)
        .project({
          name: 1,
          zone: 1,
          area: 1
        })
        .sort({ name: 1 })
        .limit(300)
        .toArray();

      return res.json(locations.map(publicLocation));
    } catch (error) {
      console.error('Public locations error:', error.message);
      return publicError(res, 500, 'Unable to load locations.');
    }
  });

  app.post('/api/reports', async (req, res) => {
    let reporterId = null;

    try {
      const reporterName = normalizeText(req.body.reporterName, 80);
      const phone = normalizeText(req.body.phone, 25);
      const locationDetails = normalizeText(req.body.locationDetails, 250);
      const locationType = normalizeText(req.body.locationType, 100);
      const issueType = normalizeText(req.body.issueType, 100);
      const urgency = normalizeText(req.body.urgency, 30).toLowerCase();
      const description = normalizeText(req.body.description, 2000);

      if (reporterName.length < 2) {
        return publicError(res, 400, 'Enter your name.');
      }

      if (locationDetails.length < 3) {
        return publicError(res, 400, 'Enter the specific location.');
      }

      if (description.length < 10) {
        return publicError(res, 400, 'Provide a more detailed description.');
      }

      if (!issueType || !locationType) {
        return publicError(res, 400, 'Select the location category and issue type.');
      }

      if (!['low', 'medium', 'high', 'critical'].includes(urgency)) {
        return publicError(res, 400, 'Select a valid urgency level.');
      }

      const reporter = {
        name: reporterName,
        role: 'Community Reporter',
        affiliation: locationType,
        phone,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const reporterResult = await db.collection('reporters').insertOne(reporter);
      reporterId = reporterResult.insertedId;

      const matchingLocation = await db.collection('locations').findOne({
        name: {
          $regex: `^${locationDetails.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
          $options: 'i'
        }
      });

      const token = createTrackingToken();
      const now = new Date();

      const report = {
        reporterId: String(reporterId),
        reporterName,
        phone,
        locationId: matchingLocation
          ? String(matchingLocation._id)
          : null,
        locationName: matchingLocation
          ? matchingLocation.name
          : locationDetails,
        locationArea: locationType,
        locationDetails,
        issueType,
        urgency,
        description,
        status: 'open',
        assignedTeam: null,
        trackingTokenHash: hashTrackingToken(token),
        activity: [
          {
            title: 'Report submitted',
            message: 'Your report has been received and is awaiting review.',
            createdBy: 'System',
            createdAt: now
          }
        ],
        createdAt: now,
        updatedAt: now,
        resolvedAt: null
      };

      const validation = validate('reports', report, true);

      if (!validation.valid) {
        await db.collection('reporters').deleteOne({ _id: reporterId });
        return publicError(res, 400, validation.message || 'Report details are invalid.');
      }

      const result = await db.collection('reports').insertOne(report);

      const trackingUrl =
        `/track.html#${encodeURIComponent(token)}`;

      return res.status(201).json({
        message: 'Report submitted successfully.',
        reportId: String(result.insertedId),
        trackingUrl
      });
    } catch (error) {
      if (reporterId) {
        await db.collection('reporters')
          .deleteOne({ _id: reporterId })
          .catch(() => {});
      }

      console.error('Public report submission error:', error.message);
      return publicError(res, 500, 'Unable to submit your report.');
    }
  });

  app.post('/api/reports/track', async (req, res) => {
    try {
      const token = normalizeText(req.body.token, 200);

      if (!/^[a-f0-9]{64}$/i.test(token)) {
        return publicError(res, 404, 'Invalid tracking link.');
      }

      const report = await db.collection('reports').findOne({
        trackingTokenHash: hashTrackingToken(token)
      });

      if (!report) {
        return publicError(res, 404, 'Report not found.');
      }

      const safeReport = {
        _id: String(report._id),
        reportNumber: report.reportNumber || String(report._id),
        reporterName: report.reporterName,
        issueType: report.issueType,
        urgency: report.urgency,
        locationName: report.locationName,
        locationDetails: report.locationDetails,
        locationArea: report.locationArea,
        description: report.description,
        status: report.status,
        assignedTeam: report.assignedTeam,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        resolvedAt: report.resolvedAt,
        activity: Array.isArray(report.activity)
          ? report.activity
          : []
      };

      return res.json({ report: safeReport });
    } catch (error) {
      console.error('Report tracking error:', error.message);
      return publicError(res, 500, 'Unable to retrieve report.');
    }
  });

  app.post('/api/admin/reports', ...requireAdminAccess(), async (req, res) => {
    try {
      const body = { ...req.body };

      delete body._id;
      delete body.createdAt;
      delete body.updatedAt;
      delete body.trackingTokenHash;

      const reporterId = safeObjectId(body.reporterId);
      if (!reporterId) {
        return publicError(res, 400, 'Select a valid reporter.');
      }

      const reporter = await db.collection('reporters').findOne({
        _id: reporterId
      });

      if (!reporter) {
        return publicError(res, 400, 'Selected reporter was not found.');
      }

      const locationId = safeObjectId(body.locationId);
      const location = locationId
        ? await db.collection('locations').findOne({ _id: locationId })
        : null;

      if (body.locationId && !location) {
        return publicError(res, 400, 'Selected location was not found.');
      }

      const now = new Date();

      const report = {
        ...body,
        reporterId: String(reporterId),
        reporterName: reporter.name,
        locationName: location ? location.name : normalizeText(body.locationName, 250),
        locationArea: location ? location.area : normalizeText(body.locationArea, 100),
        locationDetails: normalizeText(body.locationDetails, 250),
        status: normalizeStatus(body.status || 'open'),
        activity: [{
          title: 'Report created',
          message: 'An administrator created this report.',
          createdBy: req.user.name || 'Administrator',
          createdAt: now
        }],
        createdAt: now,
        updatedAt: now
      };

      if (!REPORT_STATUSES.includes(report.status)) {
        return publicError(res, 400, 'Invalid report status.');
      }

      const validation = validate('reports', report, true);

      if (!validation.valid) {
        return publicError(res, 400, validation.message || 'Report details are invalid.');
      }

      const result = await db.collection('reports').insertOne(report);

      return res.status(201).json({
        message: 'Report created.',
        report: {
          ...report,
          _id: String(result.insertedId)
        }
      });
    } catch (error) {
      console.error('Administrator report creation error:', error.message);
      return publicError(res, 500, 'Unable to create report.');
    }
  });

  app.get('/api/reports', ...requireAdminAccess(), async (req, res) => {
    try {
      const filter = {};

      if (req.query.status) {
        const status = normalizeStatus(req.query.status);

        if (!REPORT_STATUSES.includes(status)) {
          return publicError(res, 400, 'Invalid report status filter.');
        }

        filter.status = status;
      }

      const reports = await db.collection('reports')
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(500)
        .toArray();

      return res.json(reports.map(publicReport));
    } catch (error) {
      console.error('Administrator report list error:', error.message);
      return publicError(res, 500, 'Unable to load reports.');
    }
  });

  app.put('/api/reports/:id', ...requireAdminAccess(), async (req, res) => {
    try {
      const id = safeObjectId(req.params.id);
      if (!id) return publicError(res, 400, 'Invalid report ID.');

      const existing = await findReportById(req.params.id);
      if (!existing) return publicError(res, 404, 'Report not found.');

      const changes = { ...req.body };

      for (const key of [
        '_id',
        'id',
        'createdAt',
        'trackingTokenHash',
        'reporterId',
        'reporterName',
        'locationName',
        'locationArea',
        'activity'
      ]) {
        delete changes[key];
      }

      if (changes.status !== undefined) {
        changes.status = normalizeStatus(changes.status);

        if (!REPORT_STATUSES.includes(changes.status)) {
          return publicError(res, 400, 'Invalid report status.');
        }
      }

      const activityItems = [];

      if (changes.status && changes.status !== existing.status) {
        activityItems.push([
          'Status updated',
          `Your report status changed to ${changes.status}.`
        ]);

        if (changes.status === 'resolved') {
          changes.resolvedAt = new Date();
        } else if (changes.status !== 'rejected') {
          changes.resolvedAt = null;
        }
      }

      if (changes.urgency && changes.urgency !== existing.urgency) {
        activityItems.push([
          'Urgency updated',
          `Your report urgency changed to ${changes.urgency}.`
        ]);
      }

      if (
        changes.assignedTeam !== undefined &&
        JSON.stringify(changes.assignedTeam) !==
          JSON.stringify(existing.assignedTeam)
      ) {
        activityItems.push([
          'Team assignment updated',
          'The team assigned to your report has been updated.'
        ]);
      }

      let activity = Array.isArray(existing.activity)
        ? existing.activity
        : [];

      for (const [title, message] of activityItems) {
        activity = addActivity(
          { activity },
          title,
          message,
          req.user.name || 'Administrator'
        );
      }

      if (activityItems.length) {
        changes.activity = activity;
      }

      const result = await db.collection('reports').findOneAndUpdate(
        { _id: id },
        {
          $set: {
            ...changes,
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      );

      const updated = result && result.value !== undefined
        ? result.value
        : result;

      if (!updated) return publicError(res, 404, 'Report not found.');

      return res.json({
        message: 'Report updated.',
        report: publicReport(updated)
      });
    } catch (error) {
      console.error('Report update error:', error.message);
      return publicError(res, 500, 'Unable to update report.');
    }
  });

  app.delete('/api/reports/:id', ...requireAdminAccess(), async (req, res) => {
    try {
      const id = safeObjectId(req.params.id);
      if (!id) return publicError(res, 400, 'Invalid report ID.');

      const result = await db.collection('reports').deleteOne({ _id: id });

      if (!result.deletedCount) {
        return publicError(res, 404, 'Report not found.');
      }

      return res.json({ message: 'Report deleted.' });
    } catch (error) {
      console.error('Report deletion error:', error.message);
      return publicError(res, 500, 'Unable to delete report.');
    }
  });

  registerCollectionRoutes('locations');
  registerCollectionRoutes('teams');
  registerCollectionRoutes('reporters');
  registerCollectionRoutes('collectionLogs');

  registerStats(app, db);

  app.get(ADMIN_PATH, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  app.use(express.static(PUBLIC_DIR, {
    index: 'home.html',
    etag: true,
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
  }));

  app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
      return publicError(res, 404, 'API endpoint not found.');
    }

    return res.status(404).sendFile(path.join(PUBLIC_DIR, 'home.html'));
  });

  app.use((error, req, res, next) => {
    console.error('Unhandled application error:', error.message);

    if (res.headersSent) return next(error);

    return publicError(res, 500, 'An unexpected server error occurred.');
  });
}

async function startServer() {
  await client.connect();

  db = client.db(DATABASE_NAME);

  await createIndexes();

  registerRoutes();

  server = app.listen(PORT, () => {
    console.log('Bugema Clean Community Tracker is running.');
    console.log(`Port: ${PORT}`);
    console.log(`Database: ${DATABASE_NAME}`);
    console.log(`Administrator page: ${ADMIN_PATH}`);
  });
}

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);

  if (server) {
    await new Promise(resolve => server.close(resolve));
  }

  await client.close();

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer().catch(async error => {
  console.error('Server startup failed:', error.message);
  await client.close().catch(() => {});
  process.exit(1);
});
