const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const { nextId, validate } = require('../helpers');

test('public-style reports can use free-text locations', () => {
  const error = validate('reports', {
    reporterId: 'RP01',
    issueType: 'Blocked drain',
    urgency: 'High',
    locationType: 'Trading Centre',
    locationDetails: 'Bugema Trading Centre near the taxi stage'
  }, true);

  assert.equal(error, null);
});

test('reports still require a managed or exact location', () => {
  const error = validate('reports', {
    reporterId: 'RP01',
    issueType: 'Blocked drain',
    urgency: 'High'
  }, true);

  assert.equal(error, 'Select a location or provide exact location details');
});

test('report updates do not require resubmitting location details', () => {
  assert.equal(validate('reports', { status: 'in-progress' }, false), null);
});

test('ID allocation advances beyond existing records when counters lag', async () => {
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

test('public page inline scripts parse successfully', () => {
  for (const file of [
    'public/home.html',
    'public/report.html',
    'public/track.html'
  ]) {
    const html = fs.readFileSync(file, 'utf8');
    const scripts = html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi);

    for (const [index, match] of [...scripts].entries()) {
      if (match[1].trim()) {
        assert.doesNotThrow(() => {
          new vm.Script(match[1], { filename: `${file}:${index + 1}` });
        });
      }
    }
  }
});
