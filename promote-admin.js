
require('dotenv').config();

const { MongoClient } = require('mongodb');
const readline = require('readline');

const uri = process.env.MONGO_URI;

if (!uri) {
  console.error('MONGO_URI is missing from your environment settings.');
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function promoteAdmin() {
  const client = new MongoClient(uri);

  try {
    const email = (await ask('Enter the registered email of the account to promote: '))
      .trim()
      .toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.error('Please enter a valid email address.');
      return;
    }

    const confirmation = (await ask(
      `Promote ${email} to administrator? Type YES to confirm: `
    )).trim();

    if (confirmation !== 'YES') {
      console.log('Operation cancelled. No account was changed.');
      return;
    }

    await client.connect();

    const db = client.db('bugemaClean');

    const result = await db.collection('users').updateOne(
      { email },
      { $set: { role: 'admin' } }
    );

    if (result.matchedCount === 0) {
      console.log('No registered account was found with that email.');
      console.log('Register the account first, then run this script again.');
      return;
    }

    console.log('Account successfully promoted to administrator.');
  } catch (error) {
    console.error('Admin promotion failed:', error.message);
  } finally {
    await client.close().catch(() => {});
    rl.close();
  }
}

promoteAdmin();
