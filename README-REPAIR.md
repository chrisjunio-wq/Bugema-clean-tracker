# Bugema Clean Community Tracker — repaired working copy

## Important
This is a repaired development copy, not a production deployment. Keep the existing MongoDB database and back it up before making changes. Do not run destructive database commands.

## Install and run (Windows PowerShell)
1. Open this folder in VS Code.
2. Run `npm install`.
3. Create a local `.env` file (never upload or commit it) containing:
   - `MONGO_URI=your MongoDB connection string`
   - `JWT_SECRET=a long random secret generated privately`
4. Start MongoDB.
5. Run `npm start`.
6. Open `http://localhost:3000/report.html` for public community reporting.
7. Open `http://localhost:3000/` for the administrator login.

## Create the first administrator
1. Open the dashboard and register an ordinary account using `/api/auth/register` (or add a registration page later).
2. Stop the server.
3. Run `npm run promote-admin`.
4. Enter the email address of the account you just registered.
5. Start the server again and sign in. The account must log in again after promotion.

Public registration always creates a normal user. Never add an admin role to a public registration form.

## Data safety
- `npm run seed` is now non-destructive: it inserts only seed records whose IDs do not already exist. It does not replace existing records.
- Existing records are not automatically migrated or deleted.
- Back up MongoDB before any schema or deployment changes.

## Current application behavior
- Community members can submit reports at `/report.html` without an account.
- Managed locations are publicly readable as suggestions; reports can also name an unlisted village, trading centre, market, road or landmark.
- Public reports receive a random private tracking token. MongoDB stores only its SHA-256 hash, and the token is available in the private tracking link or browser storage.
- The tracker accepts a private link or token directly, so it can be used from another browser or device when the link is retained.
- Administrative data and statistics require an administrator login.
- The admin login token is kept in `sessionStorage` for the current browser tab and expires according to the server token lifetime.
- Admin report filters support date, location, area, urgency, status and text search. Team assignment and work-stage times are stored with reports; collection logs store completion times.

## Database model
- `locations`, `reporters`, `teams`, `reports` and `collectionLogs` are the five operational collections. `users` stores administrator accounts and `counters` allocates readable IDs.
- Report, location, reporter and team references are checked by the API before writes. Public reports retain exact location text and link to a managed location when the name matches.
- On startup, the server creates indexes for unique tracking hashes and user emails, report lookups, location lists and collection-log dates. Existing documents are not rewritten.
- Admin list/read/create/update/delete routes cover the operational collections. Statistics use MongoDB `$lookup` and `$group` aggregation pipelines.
- Report tokens and IDs are generated server-side; never expose or store a raw tracking token in MongoDB.

## Before public deployment
This copy still needs end-to-end testing against your actual MongoDB database and hosting environment. The current rate limits are in-memory and reset on restart; use a shared rate-limit store when running multiple instances. Configure HTTPS, secure MongoDB authentication/network rules, monitoring, backups, privacy notice/consent for contact details, and a reviewed deployment configuration. Rotate any credentials or JWT secrets that may have been exposed. Do not publish the `.env` file.
