
'use strict';

require('dotenv').config();

const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');
const { MongoClient } = require('mongodb');

const DATABASE_NAME = process.env.DB_NAME || 'bugemaClean';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function main() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI is missing from the environment.');
  }

  const rl = readline.createInterface({ input, output });
  const client = new MongoClient(mongoUri);

  try {
    const email = normalizeEmail(
      await rl.question('Enter the registered account email to promote: ')
    );

    if (!isValidEmail(email)) {
      throw new Error('Enter a valid email address.');
    }

    await client.connect();

    const db = client.db(DATABASE_NAME);
    const users = db.collection('users');

    const user = await users.findOne(
      { email },
      { projection: { name: 1, email: 1, role: 1 } }
    );

    if (!user) {
      throw new Error(
        'No account was found for that email. The user must register first.'
      );
    }

    if (user.role === 'admin') {
      console.log('This account already has administrator access.');
      return;
    }

    console.log('\nAccount selected:');
    console.log(`Name: ${user.name || 'Not provided'}`);
    console.log(`Email: ${user.email}`);
    console.log(`Current role: ${user.role || 'user'}`);
    console.log('New role: admin');

    const confirmation = (
      await rl.question('\nType YES to confirm promotion: ')
    ).trim();

    if (confirmation !== 'YES') {
      console.log('Promotion cancelled. No changes were made.');
      return;
    }

    const result = await users.updateOne(
      {
        _id: user._id,
        role: { $ne: 'admin' }
      },
      {
        $set: {
          role: 'admin',
          updatedAt: new Date()
        },
        $inc: {
          tokenVersion: 1
        }
      }
    );

    if (result.modifiedCount !== 1) {
      throw new Error(
        'The account was not updated. Check its current role and try again.'
      );
    }

    console.log('\nAdministrator access granted successfully.');
    console.log('The user must sign in again for the new role to take effect.');
  } finally {
    rl.close();
    await client.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error('\nAdministrator promotion failed:', error.message);
  process.exitCode = 1;
});
