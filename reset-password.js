
'use strict';

require('dotenv').config();

const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const DATABASE_NAME = process.env.DB_NAME || 'bugemaClean';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  if (typeof password !== 'string') {
    throw new Error('Password must be text.');
  }

  if (password.length < 12) {
    throw new Error('Password must contain at least 12 characters.');
  }

  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Password must not exceed 72 UTF-8 bytes.');
  }
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
      await rl.question('Enter the registered account email: ')
    );

    if (!isValidEmail(email)) {
      throw new Error('Enter a valid email address.');
    }

    const password = await rl.question('Enter the new password: ');
    validatePassword(password);

    const confirmation = await rl.question('Confirm the new password: ');

    if (password !== confirmation) {
      throw new Error('The passwords do not match.');
    }

    await client.connect();

    const db = client.db(DATABASE_NAME);
    const users = db.collection('users');

    const user = await users.findOne(
      { email },
      { projection: { _id: 1, email: 1 } }
    );

    if (!user) {
      throw new Error('No registered account was found with that email.');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await users.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash,
          updatedAt: new Date()
        },
        $inc: {
          tokenVersion: 1
        }
      }
    );

    if (result.modifiedCount !== 1) {
      throw new Error('The password could not be updated.');
    }

    console.log('\nPassword updated successfully.');
    console.log('All existing login sessions have been invalidated.');
  } finally {
    rl.close();
    await client.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error('\nPassword reset failed:', error.message);
  process.exitCode = 1;
});
