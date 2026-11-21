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
7. Open `http://localhost:3000/` for the public home page, then choose **Admin Login**.

## Create the first administrator
1. Configure a private `.env.atlas` file with the `MONGO_URI` for the database where the administrator should be created.
2. Run `node create-admin.js` from the project folder and enter the administrator's name, email, and password.
3. Use **Admin Login** on the home page to sign in.

Public account registration is disabled. Only accounts provisioned by a trusted administrator can sign in to the admin dashboard. Use the same MongoDB database for the app and the administrator account.

## Data safety
- `npm run seed` is now non-destructive: it inserts only seed records whose IDs do not already exist. It does not replace existing records.
- Existing records are not automatically migrated or deleted.
- Back up MongoDB before any schema or deployment changes.

## Current application behavior
- Community members can submit reports at `/report.html` without an account.
- The public report form asks whether the reporter is from the Market, a Resident area, or University/Campus, then collects a matching area and exact location details.
- After submission, the report page shows a report number and provides a **Track Your Report** button. The tracking page can also look up a report using its report number and the submitter's name, and refreshes the report status and progress history automatically.
- Locations are publicly readable so the report form can populate its location list.
- Administrative data and statistics require an administrator login. Logging out returns to the public home page.
- The admin login token is kept in `sessionStorage` for the current browser tab and expires according to the server token lifetime.

## Before public deployment
This copy still needs end-to-end testing against your actual MongoDB database and hosting environment. Add rate limiting, HTTPS, secure MongoDB authentication/network rules, monitoring, backups, privacy notice/consent for contact details, and a reviewed deployment configuration. Rotate any credentials or JWT secrets that may have been exposed. Do not publish the `.env` file.
