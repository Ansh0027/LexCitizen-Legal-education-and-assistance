# LexCitizen

## Project structure

```text
LexCitizen/
├── public/
│   ├── css/
│   ├── js/
│   ├── assets/
│   ├── books/
│   └── ipc-sections.json
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── modules/
│   ├── models/
│   ├── routes/
│   ├── views/pages/        # EJS page templates
│   └── server.js           # Express application and startup
├── test/
├── data/                   # Private contribution evidence
└── server.js               # backward-compatible entry-point shim
```

- `public/` contains styles, browser scripts, images, PDFs, and other public assets.
- `src/config/` initializes MongoDB and application configuration.
- `src/controllers/` renders application pages; `src/routes/` maps page and API URLs.
- `src/middleware/` contains shared Express error handling.
- `src/models/` defines MongoDB collections and indexes.
- `src/modules/` contains reusable infrastructure such as the MongoDB session store.
- `src/modules/central-acts-sync.js` imports Central Acts from the official India Code catalogue; `src/scripts/sync-central-acts.js` provides a one-time/manual sync command.
- `src/views/pages/` contains the EJS templates rendered by Express.
- `test/` contains Node test runners for accounts, library behavior, and the IPC index.

LexCitizen is a Node.js/Express application with EJS-rendered pages, static CSS and browser JavaScript, and an API for accounts and personal reading lists. The legacy Python server has been removed.

## Run locally

Use Node.js 22.13 or later and run MongoDB locally on `127.0.0.1:27017`.

1. In a terminal, change to this project folder and install the packages:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env`. The default `MONGODB_URI` connects to `mongodb://127.0.0.1:27017/LexCitizen`. Set `SESSION_SECRET` to a long random value. Generate one with:

   ```sh
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

3. To create the first administrator, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`. Use a unique administrator email and a strong password of at least 12 characters. The server creates or updates this administrator on startup. Normal registration always creates a user account and cannot grant administrator access.

4. Start the site and API:

   ```sh
   npm start
   ```

5. Visit [http://localhost:3000](http://localhost:3000). EJS pages and account features are served by Express.

Application records and sessions are stored in the MongoDB database named `LexCitizen`. Private contribution evidence remains in `data/private-evidence` by default and can be moved with `EVIDENCE_PATH`. Keep `.env`, `data/`, and `node_modules/` out of Git; `.gitignore` already excludes them. Existing records in a previous SQLite database are not imported automatically. The example reading materials are short educational summaries with references, not legal advice or a replacement for the full laws and judgments.

The shared MongoDB `content` collection contains the built-in learning materials, migrated legacy `materials` documents, and India Code Central Acts. Legacy documents are copied without deleting the old collection. The India Code catalogue sync runs once after application startup and then every 24 hours; tests disable the network sync. To run it manually, use `npm run sync:central-acts`. It records the official metadata, source page, and text transcription where one is available, and marks records without a text transcription rather than presenting metadata as full Act text. The India Code catalogue contained 848 Central Act records when this integration was checked; the live catalogue may change. Public catalogue responses omit full Act text and retrieve it only when a reader opens an item.

The source is the [India Code portal](https://www.indiacode.gov.in/) and its public Central Acts catalogue. Verify the portal's current terms and applicable reuse rights before redistributing official full-text transcriptions. Imported entries retain links to their official India Code pages.

## Account and reading features

- User registration and sign-in use server-side validation and bcrypt password hashes.
- Sessions are stored in MongoDB and use HTTP-only, same-site cookies. Sessions expire after 8 hours by default; "Remember me" extends the session cookie to 30 days.
- Admin accounts are provisioned with environment variables; selecting Admin in the sign-in UI does not grant admin access.
- Users can register and sign in immediately without administrator approval. The admin portal lists account creation and last-login times, each user's saved readings and reading progress, and reading-library activity. Administrator access remains separately provisioned through environment variables; a user registration cannot create an administrator.
- The learner dashboard lists reading materials, saved items, and current progress. A reader restores the last saved scroll position and updates progress while the user reads.
- Readers include animated learning illustrations, expandable key-idea cards, a scenario practice, a topic quiz, and a three-question test. Signed-in attempts are graded by the server and saved individually in MongoDB; the learner dashboard shows overall accuracy, best score, and the complete paginated attempt history.
- Published legal materials can be read from the public site without an account. Signing in enables saving a reading and resuming progress across visits.
- Signed-in users can submit proposed corrections, new explainers, and judicial updates with a required citation and source URL, plus an optional PDF, text, PNG, or JPEG evidence file (up to 5 MB). Submissions and their status are visible to their author.
- Every contribution stays private until an administrator checks the evidence, edits the final public title, summary, article, citation, and source, then explicitly publishes it. Administrators can instead reject it with a private explanation. Optional evidence is stored outside the static site and can only be downloaded through the authenticated admin portal.
- After publication, the verified material is updated in the public reading library and appears in the home page's **Verified community updates** section. Readers can open it without signing in; an account is required to save it or persist reading progress.
- Password recovery is not implemented; account recovery requires an administrator to provision a reset flow.

The backend exposes `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, `/api/materials`, `/api/materials/:slug/assessments`, `/api/me/library`, `/api/me/assessments`, `/api/me/saved/:slug`, `/api/me/progress/:slug`, and `/api/me/submissions`. Assessment answers are checked on the server; clients cannot submit their own scores. Administrator reports and actions are served by `/api/admin/overview`, `/api/admin/accounts`, `/api/admin/materials`, `/api/admin/submissions`, `/api/admin/submissions/:id/evidence`, and `/api/admin/submissions/:id/review`; each protected endpoint enforces the authenticated role on the server.

## Deployment notes

GitHub Pages serves static files only and cannot run this Express server. Deploy the Node application to a Node-capable host, set `NODE_ENV=production`, configure a random `SESSION_SECRET` and HTTPS, and provision the initial administrator through environment variables. Configure `MONGODB_URI` to point to a persistent MongoDB deployment; private evidence also needs persistent storage.

The application uses Mongoose models and MongoDB indexes for accounts, the shared content collection, saved readings, reading progress, learning attempts, submissions, and sessions. Configure automated database backups and monitoring, and keep evidence files outside the public directory. Never commit real passwords, environment files, session secrets, or production database credentials.
