
'use strict';

require('dotenv').config();

const { MongoClient } = require('mongodb');

const DATABASE_NAME = process.env.DB_NAME || 'bugemaClean';

const locations = [
  {
    name: 'Bugema University Main Campus',
    zone: 'Campus',
    area: 'University',
    binCount: 20
  },
  {
    name: 'Bugema University Main Gate',
    zone: 'Campus',
    area: 'University',
    binCount: 6
  },
  {
    name: 'Bugema Trading Centre',
    zone: 'Community',
    area: 'Trading Centre',
    binCount: 12
  },
  {
    name: 'Bugema Market',
    zone: 'Community',
    area: 'Market',
    binCount: 10
  },
  {
    name: 'Bugema Residential Area',
    zone: 'Community',
    area: 'Residential',
    binCount: 8
  }
];

const teams = [
  {
    name: 'Campus Cleaning Team',
    organization: 'Bugema University',
    supervisor: 'Campus Cleaning Supervisor',
    phone: '',
    zones: ['Campus'],
    members: [],
    shift: 'Day'
  },
  {
    name: 'Community Cleaning Team',
    organization: 'Community Services',
    supervisor: 'Community Cleaning Supervisor',
    phone: '',
    zones: ['Community'],
    members: [],
    shift: 'Day'
  }
];

const reporters = [
  {
    name: 'Campus Administration',
    role: 'Administrator',
    affiliation: 'Bugema University',
    phone: ''
  },
  {
    name: 'Community Representative',
    role: 'Community Representative',
    affiliation: 'Bugema Community',
    phone: ''
  }
];

async function seedCollection(collection, records, keyField) {
  let inserted = 0;
  let existing = 0;

  for (const record of records) {
    const key = record[keyField];

    const result = await collection.updateOne(
      { [keyField]: key },
      {
        $setOnInsert: {
          ...record,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    if (result.upsertedCount === 1) {
      inserted += 1;
    } else {
      existing += 1;
    }
  }

  return { inserted, existing };
}

async function main() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI is missing from the environment.');
  }

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();

    const db = client.db(DATABASE_NAME);

    console.log(`Seeding database: ${DATABASE_NAME}`);

    const locationResult = await seedCollection(
      db.collection('locations'),
      locations,
      'name'
    );

    const teamResult = await seedCollection(
      db.collection('teams'),
      teams,
      'name'
    );

    const reporterResult = await seedCollection(
      db.collection('reporters'),
      reporters,
      'name'
    );

    console.log('\nDatabase seeding completed.');
    console.log(
      `Locations: ${locationResult.inserted} inserted, ${locationResult.existing} already existed.`
    );
    console.log(
      `Teams: ${teamResult.inserted} inserted, ${teamResult.existing} already existed.`
    );
    console.log(
      `Reporters: ${reporterResult.inserted} inserted, ${reporterResult.existing} already existed.`
    );

    console.log(
      '\nNo existing records were overwritten. No sample reports or activity logs were created.'
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('\nDatabase seeding failed:', error.message);
  process.exitCode = 1;
});
