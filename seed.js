
require('dotenv').config();

const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const client = new MongoClient(uri);

const locations = [
  { _id: 'LC01', name: 'Lecture Block A', zone: 'Academic', area: 'Campus', binCount: 6 },
  { _id: 'LC02', name: 'Library Walkway', zone: 'Academic', area: 'Campus', binCount: 4 },
  { _id: 'LC03', name: 'Main Cafeteria', zone: 'Food area', area: 'Campus', binCount: 8 },
  { _id: 'LC04', name: "Men's Hostel Area", zone: 'Residential', area: 'Campus', binCount: 10 },
  { _id: 'LC05', name: "Women's Hostel Area", zone: 'Residential', area: 'Campus', binCount: 10 },
  { _id: 'LC06', name: 'Sports Ground', zone: 'Open space', area: 'Campus', binCount: 3 },
  { _id: 'LC07', name: 'Bugema Trading Centre', zone: 'Trading centre', area: 'Village', binCount: 6 },
  { _id: 'LC08', name: 'Village Market', zone: 'Market', area: 'Village', binCount: 12 },
  { _id: 'LC09', name: 'Main Road Stretch', zone: 'Roadside', area: 'Village', binCount: 4 },
  { _id: 'LC10', name: 'Health Centre', zone: 'Health facility', area: 'Village', binCount: 5 },
  { _id: 'LC11', name: 'Primary School', zone: 'School', area: 'Village', binCount: 4 },
  { _id: 'LC12', name: 'Residential Village A', zone: 'Village residential', area: 'Village', binCount: 8 }
];

const teams = [
  { _id: 'TM01', name: 'Alpha Cleaning Team', organization: 'University', supervisor: 'Robert Kizza', phone: '+256772300111', zones: ['Academic', 'Food area'], members: 6, shift: '6AM-2PM' },
  { _id: 'TM02', name: 'Bravo Cleaning Team', organization: 'University', supervisor: 'Agnes Nalubega', phone: '+256772300222', zones: ['Residential'], members: 8, shift: '7AM-3PM' },
  { _id: 'TM03', name: 'Grounds Team', organization: 'University', supervisor: 'Paul Wasswa', phone: '+256772300333', zones: ['Open space', 'Academic'], members: 5, shift: '7AM-3PM' },
  { _id: 'TM04', name: 'Evening Waste Crew', organization: 'University', supervisor: 'Juliet Achan', phone: '+256772300444', zones: ['Food area', 'Residential'], members: 4, shift: '2PM-10PM' },
  { _id: 'TM05', name: 'Drainage and Sanitation Team', organization: 'University', supervisor: 'Hassan Ssemakula', phone: '+256772300555', zones: ['Residential', 'Academic'], members: 3, shift: '8AM-4PM' },
  { _id: 'TM06', name: 'Town Council Waste Team', organization: 'Sub-county', supervisor: 'Peter Mugisha', phone: '+256772300666', zones: ['Trading centre', 'Market', 'Roadside'], members: 7, shift: '6AM-2PM' },
  { _id: 'TM07', name: 'Village Private Collectors', organization: 'Private collector', supervisor: 'Sarah Nakato', phone: '+256772300777', zones: ['Village residential', 'Trading centre'], members: 4, shift: '7AM-3PM' },
  { _id: 'TM08', name: 'Health Office Sanitation Unit', organization: 'Health office', supervisor: 'Moses Ochen', phone: '+256772300888', zones: ['Health facility', 'School'], members: 3, shift: '8AM-4PM' }
];

const reporters = [
  { _id: 'RP01', name: 'Brenda Nabirye', role: 'Student', affiliation: 'Campus', phone: '+256771111001' },
  { _id: 'RP02', name: 'Dr. Moses Byaruhanga', role: 'Lecturer', affiliation: 'Campus', phone: '+256771222002' },
  { _id: 'RP03', name: 'Joan Namukasa', role: 'Cafeteria staff', affiliation: 'Campus', phone: '+256771222003' },
  { _id: 'RP04', name: 'Charles Opio', role: 'Hostel warden', affiliation: 'Campus', phone: '+256771222004' },
  { _id: 'RP05', name: 'Samuel Okello', role: 'Student', affiliation: 'Campus', phone: '+256771111002' },
  { _id: 'RP06', name: 'Ruth Namugga', role: 'Student', affiliation: 'Campus', phone: '+256771111005' },
  { _id: 'RP07', name: 'Grace Nansubuga', role: 'Trader', affiliation: 'Community', phone: '+256771333007' },
  { _id: 'RP08', name: 'Fred Mukasa', role: 'LC leader', affiliation: 'Community', phone: '+256771333008' },
  { _id: 'RP09', name: 'Dorothy Atim', role: 'Health worker', affiliation: 'Community', phone: '+256771333009' },
  { _id: 'RP10', name: 'Isaac Ssebunya', role: 'Resident', affiliation: 'Community', phone: '+256771333010' }
];

const reports = [
  { _id: 'RPT01', locationId: 'LC03', reporterId: 'RP03', issueType: 'Overflowing waste', urgency: 'High', description: 'Bins behind the kitchen are overflowing and attracting flies.', status: 'resolved', assignedTeamId: 'TM04', source: 'Walk-in', reportedAt: new Date('2026-10-08T07:40:00Z'), resolvedAt: new Date('2026-10-08T11:15:00Z') },
  { _id: 'RPT02', locationId: 'LC01', reporterId: 'RP02', issueType: 'Full bin', urgency: 'Medium', description: 'Two bins outside Room A3 are full after morning classes.', status: 'in-progress', assignedTeamId: 'TM01', source: 'Phone call', reportedAt: new Date('2026-10-12T10:20:00Z'), resolvedAt: null },
  { _id: 'RPT03', locationId: 'LC04', reporterId: 'RP04', issueType: 'Missed collection', urgency: 'High', description: 'Hostel skip was not emptied for two days.', status: 'assigned', assignedTeamId: 'TM02', source: 'Phone call', reportedAt: new Date('2026-10-12T14:05:00Z'), resolvedAt: null },
  { _id: 'RPT04', locationId: 'LC02', reporterId: 'RP01', issueType: 'Litter on walkway', urgency: 'Low', description: 'Plastic bottles and papers along the library path.', status: 'open', assignedTeamId: null, source: 'App', reportedAt: new Date('2026-10-13T08:10:00Z'), resolvedAt: null },
  { _id: 'RPT05', locationId: 'LC05', reporterId: 'RP06', issueType: 'Blocked drain', urgency: 'High', description: 'Waste is blocking the drain behind the hostel.', status: 'open', assignedTeamId: null, source: 'App', reportedAt: new Date('2026-10-13T09:30:00Z'), resolvedAt: null },
  { _id: 'RPT06', locationId: 'LC06', reporterId: 'RP05', issueType: 'Full bin', urgency: 'Low', description: "Bins near the pitch are full after Saturday's match.", status: 'resolved', assignedTeamId: 'TM03', source: 'Walk-in', reportedAt: new Date('2026-10-10T16:00:00Z'), resolvedAt: new Date('2026-10-11T08:30:00Z') },
  { _id: 'RPT07', locationId: 'LC03', reporterId: 'RP01', issueType: 'Missed collection', urgency: 'Medium', description: 'Cafeteria waste was not collected this morning.', status: 'assigned', assignedTeamId: 'TM04', source: 'App', reportedAt: new Date('2026-10-13T07:55:00Z'), resolvedAt: null },
  { _id: 'RPT08', locationId: 'LC08', reporterId: 'RP07', issueType: 'Market waste', urgency: 'High', description: 'Rotting vegetables piled behind the market stalls.', status: 'in-progress', assignedTeamId: 'TM06', source: 'Walk-in', reportedAt: new Date('2026-10-14T06:45:00Z'), resolvedAt: null },
  { _id: 'RPT09', locationId: 'LC09', reporterId: 'RP08', issueType: 'Illegal dumping', urgency: 'Medium', description: 'Rubbish dumped along the roadside near the junction.', status: 'open', assignedTeamId: null, source: 'Phone call', reportedAt: new Date('2026-10-14T09:00:00Z'), resolvedAt: null },
  { _id: 'RPT10', locationId: 'LC10', reporterId: 'RP09', issueType: 'Open sewage', urgency: 'High', description: 'Sewage is leaking near the health centre entrance.', status: 'assigned', assignedTeamId: 'TM08', source: 'Phone call', reportedAt: new Date('2026-10-14T10:30:00Z'), resolvedAt: null },
  { _id: 'RPT11', locationId: 'LC12', reporterId: 'RP10', issueType: 'Burning of waste', urgency: 'Medium', description: 'Neighbours are burning plastic waste and smoke is spreading.', status: 'open', assignedTeamId: null, source: 'Walk-in', reportedAt: new Date('2026-10-15T07:15:00Z'), resolvedAt: null },
  { _id: 'RPT12', locationId: 'LC11', reporterId: 'RP08', issueType: 'Full bin', urgency: 'Low', description: 'Bins at the primary school gate are full.', status: 'resolved', assignedTeamId: 'TM08', source: 'Phone call', reportedAt: new Date('2026-10-11T08:00:00Z'), resolvedAt: new Date('2026-10-12T09:30:00Z') },
  { _id: 'RPT13', locationId: 'LC07', reporterId: 'RP07', issueType: 'Stagnant water', urgency: 'Medium', description: 'Stagnant water with mosquitoes near the trading centre drain.', status: 'in-progress', assignedTeamId: 'TM06', source: 'Walk-in', reportedAt: new Date('2026-10-15T08:20:00Z'), resolvedAt: null },
  { _id: 'RPT14', locationId: 'LC08', reporterId: 'RP10', issueType: 'Dead animal', urgency: 'High', description: 'Dead animal left near the market entrance.', status: 'resolved', assignedTeamId: 'TM06', source: 'Phone call', reportedAt: new Date('2026-10-12T06:30:00Z'), resolvedAt: new Date('2026-10-12T10:00:00Z') }
];

const collectionLogs = [
  { _id: 'CL01', locationId: 'LC03', teamId: 'TM04', scheduledFor: new Date('2026-10-12'), status: 'collected', wasteType: 'Organic', note: 'On time' },
  { _id: 'CL02', locationId: 'LC04', teamId: 'TM02', scheduledFor: new Date('2026-10-10'), status: 'missed', wasteType: 'Mixed', note: 'Truck breakdown' },
  { _id: 'CL03', locationId: 'LC04', teamId: 'TM02', scheduledFor: new Date('2026-10-11'), status: 'missed', wasteType: 'Mixed', note: 'Truck breakdown' },
  { _id: 'CL04', locationId: 'LC01', teamId: 'TM01', scheduledFor: new Date('2026-10-12'), status: 'collected', wasteType: 'Plastic', note: 'On time' },
  { _id: 'CL05', locationId: 'LC05', teamId: 'TM02', scheduledFor: new Date('2026-10-12'), status: 'collected', wasteType: 'Mixed', note: 'On time' },
  { _id: 'CL06', locationId: 'LC03', teamId: 'TM04', scheduledFor: new Date('2026-10-13'), status: 'missed', wasteType: 'Organic', note: 'Crew shortage' },
  { _id: 'CL07', locationId: 'LC08', teamId: 'TM06', scheduledFor: new Date('2026-10-13'), status: 'missed', wasteType: 'Organic', note: 'Truck breakdown' },
  { _id: 'CL08', locationId: 'LC07', teamId: 'TM06', scheduledFor: new Date('2026-10-14'), status: 'collected', wasteType: 'Mixed', note: 'On time' },
  { _id: 'CL09', locationId: 'LC10', teamId: 'TM08', scheduledFor: new Date('2026-10-14'), status: 'collected', wasteType: 'Medical', note: 'Handled with safety gear' },
  { _id: 'CL10', locationId: 'LC12', teamId: 'TM07', scheduledFor: new Date('2026-10-15'), status: 'collected', wasteType: 'Plastic', note: 'On time' }
];

async function seed() {
  try {
    await client.connect();

    const db = client.db('bugemaClean');

    const data = {
      locations,
      teams,
      reporters,
      reports,
      collectionLogs
    };

    for (const [name, docs] of Object.entries(data)) {
      for (const doc of docs) {
        await db.collection(name).updateOne(
          { _id: doc._id },
          { $setOnInsert: doc },
          { upsert: true }
        );
      }

      console.log(`${name}: checked ${docs.length} sample records`);
    }

    // Synchronize counters without reducing existing values.
    const prefixes = {
      locations: 'LC',
      teams: 'TM',
      reporters: 'RP',
      reports: 'RPT',
      collectionLogs: 'CL'
    };

    for (const [name, prefix] of Object.entries(prefixes)) {
      const highest = await db.collection(name).aggregate([
        {
          $match: {
            _id: { $regex: `^${prefix}[0-9]+$` }
          }
        },
        {
          $project: {
            number: {
              $toInt: {
                $substrCP: [
                  '$_id',
                  prefix.length,
                  { $strLenCP: '$_id' }
                ]
              }
            }
          }
        },
        { $sort: { number: -1 } },
        { $limit: 1 }
      ]).toArray();

      const highestNumber = highest.length ? highest[0].number : 0;

      await db.collection('counters').updateOne(
        { _id: name },
        { $max: { sequence: highestNumber } },
        { upsert: true }
      );
    }

    await db.collection('reports').createIndex({ status: 1, urgency: 1 });

    console.log('Seed completed safely. Existing records were preserved.');
  } finally {
    await client.close();
  }
}

seed().catch(error => {
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
});
