# LexCitizen

LexCitizen is a plain HTML, CSS, and JavaScript legal-education site with a small Node.js/Express backend for accounts and personal reading lists.

## Run locally

Use Node.js 22.13 or later (the backend uses Node's built-in SQLite module).

1. In a terminal, change to this project folder and install the packages:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env`. Set `SESSION_SECRET` to a long random value. Generate one with:

   ```sh
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

3. To create the first administrator, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`. Use a unique administrator email and a strong password of at least 12 characters. The server creates or updates this administrator on startup. Normal registration always creates a user account and cannot grant administrator access.

4. Start the site and API:

   ```sh
   npm start
   ```

5. Visit [http://localhost:3000](http://localhost:3000). Do not open the HTML files directly with `file://`; account features require the server.

The SQLite database is created at `data/lexcitizen.sqlite`. Keep `.env`, `data/`, and `node_modules/` out of Git; `.gitignore` already excludes them. The example reading materials are short educational summaries with references, not legal advice or a replacement for the full laws and judgments.

## Account and reading features

- User registration and sign-in use server-side validation and bcrypt password hashes.
- Sessions are stored in SQLite and use HTTP-only, same-site cookies. Sessions expire after 8 hours by default; "Remember me" extends the session cookie to 30 days.
- Admin accounts are provisioned with environment variables; selecting Admin in the sign-in UI does not grant admin access.
- New user registrations are pending until an administrator approves them. The admin portal lists account requests, account creation and last-login times, each user's saved readings and reading progress, and the reading library's activity. Administrators can approve or deny pending user accounts; decisions cannot promote a user to administrator.
- Existing accounts in databases created before approval requests were added are kept approved during the automatic schema migration.
- The learner dashboard lists reading materials, saved items, and current progress. A reader restores the last saved scroll position and updates progress while the user reads.
- Published legal materials can be read from the public site without an account. Signing in enables saving a reading and resuming progress across visits.
- Signed-in users can submit proposed corrections, new explainers, and judicial updates with a required citation and source URL, plus an optional PDF, text, PNG, or JPEG evidence file (up to 5 MB). Submissions and their status are visible to their author.
- Every contribution stays private until an administrator checks the evidence, edits the final public title, summary, article, citation, and source, then explicitly publishes it. Administrators can instead reject it with a private explanation. Optional evidence is stored outside the static site and can only be downloaded through the authenticated admin portal.
- After publication, the verified material is updated in the public reading library and appears in the home page's **Verified community updates** section. Readers can open it without signing in; an account is required to save it or persist reading progress.
- Password recovery is not implemented; account recovery requires an administrator to provision a reset flow.

The backend exposes `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, `/api/materials`, `/api/me/library`, `/api/me/saved/:slug`, `/api/me/progress/:slug`, and `/api/me/submissions`. Administrator reports and actions are served by `/api/admin/overview`, `/api/admin/accounts`, `/api/admin/accounts/:id/decision`, `/api/admin/materials`, `/api/admin/submissions`, `/api/admin/submissions/:id/evidence`, and `/api/admin/submissions/:id/review`; each protected endpoint enforces the authenticated role on the server.

## Deployment notes

GitHub Pages serves static files only and cannot run this Express server. Deploy the Node application to a Node-capable host, set `NODE_ENV=production`, configure a random `SESSION_SECRET` and HTTPS, and provision the initial administrator through environment variables. The database and session records must be on persistent storage.

Node's built-in SQLite API is marked experimental in Node.js 22. This implementation is suitable as a learning/prototype backend. For a public production service, use a supported stable SQLite driver or a managed database, configure backups, and keep the database off the static web root. Never commit real passwords, environment files, session secrets, or production database files.
