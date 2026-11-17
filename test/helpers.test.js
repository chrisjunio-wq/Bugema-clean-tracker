
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CONFIG,
  REFERENCES,
  REPORT_STATUSES,
  CLOSED_REPORT_STATUSES,
  nextId,
  fixDates,
  validate,
  joinStages
} = require('../helpers');

test('Configuration exports are available', () => {
  assert.ok(CONFIG);
  assert.equal(typeof CONFIG, 'object');
});

test('Reference configuration is available', () => {
  assert.ok(REFERENCES);
  assert.equal(typeof REFERENCES, 'object');
});

test('All supported report statuses are configured', () => {
  const expected = [
    'open',
    'under-review',
    'assigned',
    'in-progress',
    'resolved',
    'rejected'
  ];

  assert.deepEqual(REPORT_STATUSES, expected);
});

test('Resolved and rejected are closed statuses', () => {
  assert.deepEqual(CLOSED_REPORT_STATUSES, ['resolved', 'rejected']);
});

test('Report validation rejects missing reporter ID', () => {
  const error = validate('reports', {
    issueType: 'Illegal dumping',
    urgency: 'High',
    locationDetails: 'Near the main road'
  }, true);

  assert.equal(error, 'reporterId is required');
});

test('Report validation rejects missing issue type', () => {
  const error = validate('reports', {
    reporterId: 'RP01',
    urgency: 'High',
    locationDetails: 'Near the main road'
  }, true);

  assert.equal(error, 'issueType is required');
});

test('Report validation rejects missing urgency', () => {
  const error = validate('reports', {
    reporterId: 'RP01',
    issueType: 'Illegal dumping',
    locationDetails: 'Near the main road'
  }, true);

  assert.equal(error, 'urgency is required');
});

test('Report validation accepts free-text location details', () => {
  const error = validate('reports', {
    reporterId: 'RP01',
    issueType: 'Illegal dumping',
    urgency: 'High',
    locationType: 'Market',
    locationDetails: 'Behind the community market'
  }, true);

  assert.equal(error, null);
});

test('Report validation rejects missing location information', () => {
  const error = validate('reports', {
    reporterId: 'RP01',
    issueType: 'Illegal dumping',
    urgency: 'High'
  }, true);

  assert.equal(
    error,
    'Select a location or provide exact location details'
  );
});

test('Partial report updates do not require creation fields', () => {
  const error = validate('reports', {
    status: 'under-review'
  }, false);

  assert.equal(error, null);
});

test('Report validation rejects unsupported status', () => {
  const error = validate('reports', {
    status: 'waiting'
  }, false);

  assert.equal(error, 'Invalid report status');
});

test('Report validation accepts every supported status update', () => {
  for (const status of REPORT_STATUSES) {
    const error = validate('reports', { status }, false);

    assert.equal(error, null, `Status should be accepted: ${status}`);
  }
});

test('Date helper converts configured report date fields', () => {
  const source = {
    reportedAt: '2026-10-10T10:00:00.000Z'
  };

  const result = fixDates('reports', source);

  assert.ok(result.reportedAt instanceof Date);
  assert.equal(
    result.reportedAt.toISOString(),
    '2026-10-10T10:00:00.000Z'
  );
});

test('Date helper preserves unrelated fields', () => {
  const source = {
    reportedAt: '2026-10-10T10:00:00.000Z',
    issueType: 'Illegal dumping',
    urgency: 'High'
  };

  const result = fixDates('reports', source);

  assert.equal(result.issueType, 'Illegal dumping');
  assert.equal(result.urgency, 'High');
});

test('Date helper converts empty configured dates to null', () => {
  const result = fixDates('reports', {
    reportedAt: ''
  });

  assert.equal(result.reportedAt, null);
});

test('Validation rejects invalid report dates', () => {
  const error = validate('reports', {
    reportedAt: new Date('not-a-date')
  }, false);

  assert.equal(error, 'reportedAt must be a valid date');
});

test('Join stages returns a report aggregation pipeline', () => {
  const pipeline = joinStages('reports');

  assert.ok(Array.isArray(pipeline));
  assert.ok(pipeline.length > 0);
});

test('ID allocation advances beyond existing records', async () => {
  let sequence = 4;

  const database = {
    collection(name) {
      if (name === 'reports') {
        return {
          aggregate() {
            return {
              next: async () => ({ sequence: 14 })
            };
          }
        };
      }

      return {
        async updateOne(_filter, update) {
          sequence = Math.max(sequence, update.$max.sequence);
        },

        async findOneAndUpdate() {
          sequence += 1;
          return { sequence };
        }
      };
    }
  };

  assert.equal(await nextId(database, 'reports'), 'RPT15');
});
