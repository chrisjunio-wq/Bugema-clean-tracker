require('dotenv').config();

const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(resolve => rl.question(q, resolve));

async function main() {
  const name = (await ask('Admin name: ')).trim();
  const email = (await ask('Admin email: ')).trim().toLowerCase();
  const password = await ask('Admin password (12–72 UTF-8 bytes): ');
  rl.close();

  if (name.length < 2) throw new Error('Name is too short.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email.');
  if (
    password.length < 12 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw new Error('Password must contain 12–72 UTF-8 bytes.');
  }

  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const users = client.db('bugemaClean').collection('users');
    await users.createIndex({ email: 1 }, { unique: true });

    const hash = await bcrypt.hash(password, 12);
    const existing = await users.findOne({ email });

    if (existing) {
      await users.updateOne({ email }, { $set: { name, password: hash, role: 'admin' } });
      console.log('Existing account updated and set as administrator.');
    } else {
      await users.insertOne({ name, email, password: hash, role: 'admin', createdAt: new Date() });
      console.log('Administrator account created.');
    }
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});