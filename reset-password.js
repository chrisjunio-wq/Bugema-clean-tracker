require('dotenv').config();

const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = question =>
  new Promise(resolve => rl.question(question, resolve));

async function main() {
  const email = (await ask('Account email: ')).trim().toLowerCase();
  const password = await ask('Enter your new password (12–72 UTF-8 bytes): ');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid account email address.');
  }

  if (
    password.length < 12 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw new Error('Password must contain 12–72 UTF-8 bytes.');
  }

  const client = new MongoClient(process.env.MONGO_URI);

  try {
    await client.connect();

    const db = client.db('bugemaClean');
    const users = db.collection('users');

    const user = await users.findOne({ email });

    if (!user) {
      throw new Error('Account not found.');
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await users.updateOne(
      { _id: user._id },
      { $set: { password: hashedPassword } }
    );

    console.log('Password reset successfully for:', email);
  } finally {
    await client.close();
    rl.close();
  }
}

main().catch(error => {
  console.error('Password reset failed:', error.message);
  rl.close();
  process.exitCode = 1;
});