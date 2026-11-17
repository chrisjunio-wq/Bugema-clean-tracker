
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
  if (typeof password !== 'string' || password.length < 12) {
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
    const name = String(
      await rl.question('Administrator full name: ')
    ).trim();

    if (name.length < 2 || name.length > 80) {
      throw new Error('Name must contain between 2 and 80 characters.');
    }

    const email = normalizeEmail(
      await rl.question('Administrator email: ')
    );

    if (!isValidEmail(email)) {
      throw new Error('Enter a valid email address.');
    }

    const password = await rl.question('Administrator password: ');
    validatePassword(password);

    const confirmation = await rl.question('Confirm password: ');

    if (password !== confirmation) {
      throw new Error('The passwords do not match.');
    }

    await client.connect();

    const db = client.db(DATABASE_NAME);
    const users = db.collection('users');

    const existingUser = await users.findOne(
      { email },
      { projection: { _id: 1, name: 1, email: 1, role: 1 } }
    );

    if (existingUser) {
      console.log('\nAn account with this email already exists.');
      console.log(`Name: ${existingUser.name || 'Not provided'}`);
      console.log(`Email: ${existingUser.email}`);
      console.log(`Current role: ${existingUser.role || 'user'}`);

      const answer = (
        await rl.question(
          '\nPromote this existing account to administrator without changing its password? Type YES: '
        )
      ).trim();

      if (answer !== 'YES') {
        console.log('Operation cancelled. No changes were made.');
        return;
      }

      if (existingUser.role === 'admin') {
        console.log('This account already has administrator access.');
        return;
      }

      const result = await users.updateOne(
        {
          _id: existingUser._id,
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
        throw new Error('The existing account could not be promoted.');
      }

      console.log('\nExisting account promoted successfully.');
      console.log('The user must sign in again.');
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();

    await users.insertOne({
      name,
      email,
      passwordHash,
      role: 'admin',
      tokenVersion: 0,
      createdAt: now,
      updatedAt: now
    });

    console.log('\nAdministrator account created successfully.');
    console.log(`Email: ${email}`);
    console.log('Keep the password secure.');
  } finally {
    rl.close();
    await client.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error('\nAdministrator setup failed:', error.message);
  process.exitCode = 1;
});
