
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CONFIG,
  REFERENCES,
  REPORT_STATUSES,
  CLOSED_REPORT_STATUSES,
  fixDates,
  validate,
  joinStages
} = require('../helpers');

test('Report statuses contain all supported workflow stages', () => {
  const expected = [
    'open',
    'under-review',
    'assigned',
    'in-progress',
    'resolved',
    'rejected'
  ];

  for (const status of expected) {
    assert.ok(
      REPORT_STATUSES.includes(status),
      `Missing report status: ${status}`
    );
  }
});

test('Resolved and rejected reports are closed statuses', () => {
  assert.deepEqual(
    CLOSED_REPORT_STATUSES,
    ['resolved', 'rejected']
  );
});

test('Report validation rejects missing reporter ID', () => {
  const result = validate('reports', {
    issueType: 'Illegal dumping',
    urgency: 'high',
    locationDetails: 'Near the main road'
  }, true);

  assert.equal(result.valid, false);
});

test('Report validation rejects missing issue type', () => {
  const result = validate('reports', {
    reporterId: 'REP-001',
    urgency: 'high',
    locationDetails: 'Near the main road'
  }, true);

  assert.equal(result.valid, false);
});

test('Report validation rejects missing urgency', () => {
  const result = validate('reports', {
    reporterId: 'REP-001',
    issueType: 'Illegal dumping',
    locationDetails: 'Near the main road'
  }, true);

  assert.equal(result.valid, false);
});

test('Report validation accepts free-text location details', () => {
  const result = validate('reports', {
    reporterId: 'REP-001',
    issueType: 'Illegal dumping',
    urgency: 'high',
    locationDetails: 'Behind the community market'
  }, true);

  assert.equal(result.valid, true);
});

test('Report validation rejects a report without location information', () => {
  const result = validate('reports', {
    reporterId: 'REP-001',
    issueType: 'Illegal dumping',
    urgency: 'high'
  }, true);

  assert.equal(result.valid, false);
});

test('Partial report updates do not require creation fields', () => {
  const result = validate('reports', {
    status: 'under-review'
  }, false);

  assert.equal(result.valid, true);
});

test('Report validation rejects unsupported status', () => {
  const result = validate('reports', {
    status: 'waiting'
  }, false);

  assert.equal(result.valid, false);
});

test('Report validation accepts supported status updates', () => {
  for (const status of REPORT_STATUSES) {
    const result = validate('reports', { status }, false);

    assert.equal(
      result.valid,
      true,
      `Status should be accepted: ${status}`
    );
  }
});

test('Date helper converts valid date values', () => {
  const source = {
    createdAt: '2026-10-10T10:00:00.000Z'
  };

  const result = fixDates(source);

  assert.ok(result.createdAt instanceof Date);
  assert.equal(
    result.createdAt.toISOString(),
    '2026-10-10T10:00:00.000Z'
  );
});

test('Date helper does not mutate the original object', () => {
  const source = {
    createdAt: '2026-10-10T10:00:00.000Z'
  };

  fixDates(source);

  assert.equal(
    typeof source.createdAt,
    'string'
  );
});

test('Date helper preserves unrelated fields', () => {
  const source = {
    createdAt: '2026-10-10T10:00:00.000Z',
    issueType: 'Illegal dumping',
    urgency: 'high'
  };

  const result = fixDates(source);

  assert.equal(result.issueType, source.issueType);
  assert.equal(result.urgency, source.urgency);
});

test('joinStages returns an aggregation pipeline', () => {
  const pipeline = joinStages();

  assert.ok(Array.isArray(pipeline));
});

test('Configuration exports are available', () => {
  assert.ok(CONFIG);
  assert.equal(typeof CONFIG, 'object');
});

test('Reference configuration is available', () => {
  assert.ok(REFERENCES);
  assert.equal(typeof REFERENCES, 'object');
});
