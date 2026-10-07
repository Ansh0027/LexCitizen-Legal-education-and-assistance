require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const session = require('express-session');
const multer = require('multer');

const production = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;
if (production && (!sessionSecret || sessionSecret.length < 32)) {
  throw new Error('Set SESSION_SECRET to a random value at least 32 characters long in production.');
}

const projectDirectory = __dirname;
const databasePath = path.resolve(projectDirectory, process.env.DB_PATH || './data/lexcitizen.sqlite');
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    username TEXT UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approval_status TEXT NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    last_login_at TEXT
  );
  CREATE TABLE IF NOT EXISTS materials (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    body TEXT NOT NULL,
    source TEXT NOT NULL,
    source_url TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS saved_materials (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    material_slug TEXT NOT NULL REFERENCES materials(slug) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, material_slug)
  );
  CREATE TABLE IF NOT EXISTS reading_progress (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    material_slug TEXT NOT NULL REFERENCES materials(slug) ON DELETE CASCADE,
    position_percent INTEGER NOT NULL DEFAULT 0 CHECK (position_percent BETWEEN 0 AND 100),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, material_slug)
  );
  CREATE TABLE IF NOT EXISTS editorial_submissions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_type TEXT NOT NULL CHECK (request_type IN ('correction', 'new_article', 'judicial_update')),
    target_material_slug TEXT REFERENCES materials(slug) ON DELETE SET NULL,
    proposed_title TEXT NOT NULL,
    proposed_category TEXT NOT NULL,
    proposed_excerpt TEXT NOT NULL,
    proposed_body TEXT NOT NULL,
    citation TEXT NOT NULL,
    source_url TEXT NOT NULL,
    evidence_filename TEXT,
    evidence_storage_name TEXT,
    evidence_mime_type TEXT,
    evidence_size INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    final_title TEXT,
    final_category TEXT,
    final_excerpt TEXT,
    final_body TEXT,
    final_citation TEXT,
    final_source_url TEXT,
    published_material_slug TEXT REFERENCES materials(slug) ON DELETE SET NULL,
    review_note TEXT,
    reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS editorial_submissions_status_idx ON editorial_submissions(status, created_at);
  CREATE INDEX IF NOT EXISTS editorial_submissions_user_idx ON editorial_submissions(user_id, created_at);
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS progress_user_idx ON reading_progress(user_id, updated_at);
`);

const userColumns = new Set(database.prepare('PRAGMA table_info(users)').all().map((column) => column.name));
if (!userColumns.has('approval_status')) {
  database.exec("ALTER TABLE users ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected'))");
}
if (!userColumns.has('last_login_at')) {
  database.exec('ALTER TABLE users ADD COLUMN last_login_at TEXT');
}
const submissionColumns = new Set(database.prepare('PRAGMA table_info(editorial_submissions)').all().map((column) => column.name));
if (!submissionColumns.has('published_material_slug')) {
  database.exec('ALTER TABLE editorial_submissions ADD COLUMN published_material_slug TEXT REFERENCES materials(slug) ON DELETE SET NULL');
}

const materials = [
  {
    slug: 'article-21-right-to-life',
    title: 'Article 21: Right to life and personal liberty',
    category: 'Fundamental rights',
    excerpt: 'Explore the constitutional protection of life, liberty, dignity, and personal freedom.',
    body: `Article 21 of the Constitution of India provides that no person shall be deprived of life or personal liberty except according to procedure established by law.\n\nThe Supreme Court has interpreted this protection broadly. In Maneka Gandhi v. Union of India (1978), the Court held that a procedure affecting personal liberty must be fair, just, and reasonable. Later decisions have discussed dignity, privacy, health, and other interests in the context of Article 21.\n\nThe precise scope of a right depends on the facts and the law applied by the courts. This explainer is an educational introduction, not legal advice.`,
    source: 'Constitution of India, Article 21; Maneka Gandhi v. Union of India (1978)',
    source_url: 'https://www.indiacode.nic.in/',
  },
  {
    slug: 'article-14-equality',
    title: 'Article 14: Equality before the law',
    category: 'Fundamental rights',
    excerpt: 'Understand equality before the law and equal protection of the laws.',
    body: `Article 14 guarantees equality before the law and equal protection of the laws to every person within the territory of India.\n\nEquality does not always require identical treatment. Courts have recognised that the law may classify people or situations when the distinction has a rational connection to a legitimate purpose. Whether a particular classification is constitutional depends on its facts and the applicable legal test.\n\nThis plain-language overview is educational information and should not be relied on as legal advice.`,
    source: 'Constitution of India, Article 14',
    source_url: 'https://www.indiacode.nic.in/',
  },
  {
    slug: 'fundamental-duties',
    title: 'The eleven Fundamental Duties',
    category: 'Fundamental duties',
    excerpt: 'A practical introduction to the civic responsibilities listed in Article 51A.',
    body: `Article 51A of the Constitution sets out fundamental duties of citizens. They include respecting the Constitution and its ideals, cherishing the national freedom struggle, protecting the sovereignty and unity of India, promoting harmony, and protecting the natural environment.\n\nThe duties also refer to developing scientific temper and humanism, safeguarding public property, striving for excellence, and providing educational opportunities to children aged six to fourteen for parents or guardians.\n\nThese duties help describe civic responsibilities. Their legal effect depends on the particular statute and context.`,
    source: 'Constitution of India, Part IVA, Article 51A',
    source_url: 'https://www.indiacode.nic.in/',
  },
  {
    slug: '73rd-amendment-panchayats',
    title: 'The 73rd Amendment and Panchayati Raj',
    category: 'Constitutional amendments',
    excerpt: 'An introduction to the constitutional framework for rural local self-government.',
    body: `The Constitution (Seventy-third Amendment) Act, 1992 inserted Part IX into the Constitution and gave constitutional recognition to Panchayats. It came into force on 24 April 1993.\n\nPart IX provides for Gram Sabhas and a general three-tier structure, subject to the constitutional provisions and exceptions. It addresses elections, reservation of seats, duration, and State Finance Commissions. The Eleventh Schedule lists matters that may be considered for devolution to Panchayats.\n\nThe exact powers and responsibilities of Panchayats also depend on state legislation. This overview is educational information, not legal advice.`,
    source: 'Constitution of India, Part IX; Constitution (Seventy-third Amendment) Act, 1992',
    source_url: 'https://www.indiacode.nic.in/',
  },
  {
    slug: 'preamble-constitutional-theory',
    title: 'The Preamble: a constitutional compass',
    category: 'Constitutional theory',
    excerpt: 'Read the Preamble’s commitments to justice, liberty, equality, and fraternity.',
    body: `The Preamble introduces the Constitution and expresses the values and aims of the constitutional order. It describes India as a sovereign, socialist, secular, democratic republic and states commitments to justice, liberty, equality, and fraternity.\n\nIn Kesavananda Bharati v. State of Kerala (1973), the Supreme Court considered the Preamble while explaining the Constitution’s basic structure. The Preamble is an important aid to understanding constitutional purpose, read alongside the operative provisions of the Constitution.\n\nThis is a short educational note, not a substitute for the full constitutional text or legal advice.`,
    source: 'Constitution of India, Preamble; Kesavananda Bharati v. State of Kerala (1973)',
    source_url: 'https://www.indiacode.nic.in/',
  },
  {
    slug: 'consumer-protection-research',
    title: 'Consumer protection: a research starting point',
    category: 'Law and research',
    excerpt: 'A guided starting point for reading the Consumer Protection Act, 2019.',
    body: `The Consumer Protection Act, 2019 provides a statutory framework addressing consumer rights, consumer dispute redressal commissions, and the Central Consumer Protection Authority, among other matters.\n\nWhen researching a consumer issue, identify the transaction, preserve bills and communications, check the current Act and rules, and verify the territorial and monetary jurisdiction of the relevant forum. Limitation periods and available remedies depend on the circumstances and current law.\n\nThis educational research note does not assess an individual dispute. Consult the current official statute and a qualified legal professional for advice.`,
    source: 'Consumer Protection Act, 2019',
    source_url: 'https://www.indiacode.nic.in/',
  },
  {
    slug: 'right-to-information',
    title: 'The Right to Information Act',
    category: 'Everyday laws',
    excerpt: 'Learn how the RTI framework enables access to information held by public authorities.',
    body: `The Right to Information Act, 2005 establishes a framework for citizens to request information held by public authorities, subject to the Act’s provisions and exemptions.\n\nA useful request identifies the public authority and asks for specific existing records. The Act also provides for designated Public Information Officers and an appeal process. Application requirements, fees, exemptions, and deadlines should be checked against the current law and the relevant authority’s guidance.\n\nThis introduction is for learning and is not legal advice.`,
    source: 'Right to Information Act, 2005',
    source_url: 'https://www.indiacode.nic.in/',
  },
  {
    slug: 'privacy-judgment-puttaswamy',
    title: 'Privacy as a fundamental right: Puttaswamy',
    category: 'Judicial decisions',
    excerpt: 'A case note on the Supreme Court’s nine-judge bench decision on privacy.',
    body: `In Justice K.S. Puttaswamy (Retd.) v. Union of India, (2017) 10 SCC 1, a nine-judge bench of the Supreme Court unanimously recognised privacy as a fundamental right protected under Part III of the Constitution.\n\nThe decision discusses privacy in relation to liberty, dignity, autonomy, and other constitutional guarantees. It is a foundational judgment, but how its principles apply to a particular issue depends on later law and the facts.\n\nThis short case note summarises the decision for educational purposes. Read the judgment and later authorities for research; this is not legal advice.`,
    source: 'Justice K.S. Puttaswamy (Retd.) v. Union of India, (2017) 10 SCC 1',
    source_url: 'https://www.sci.gov.in/',
  },
];

const insertMaterial = database.prepare(`
  INSERT INTO materials (slug, title, category, excerpt, body, source, source_url)
  VALUES (@slug, @title, @category, @excerpt, @body, @source, @source_url)
  ON CONFLICT(slug) DO NOTHING
`);
database.exec('BEGIN');
try {
  materials.forEach((item) => insertMaterial.run(item));
  database.exec('COMMIT');
} catch (error) {
  database.exec('ROLLBACK');
  throw error;
}

if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  if (process.env.ADMIN_PASSWORD.length < 12 || Buffer.byteLength(process.env.ADMIN_PASSWORD, 'utf8') > 72) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters and no more than 72 UTF-8 bytes.');
  }
  const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ADMIN_EMAIL must be a valid email address.');
  }
  const passwordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
  database.prepare(`
    INSERT INTO users (id, email, username, password_hash, role)
    VALUES (?, ?, 'admin', ?, 'admin')
    ON CONFLICT(email) DO UPDATE SET
      username = 'admin', password_hash = excluded.password_hash, role = 'admin'
  `).run(crypto.randomUUID(), email, passwordHash);
}

class SQLiteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this.getSession = db.prepare('SELECT data FROM sessions WHERE sid = ? AND (expires_at IS NULL OR expires_at > ?)');
    this.setSession = db.prepare('INSERT OR REPLACE INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)');
    this.deleteSession = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchSession = db.prepare('UPDATE sessions SET expires_at = ? WHERE sid = ?');
    this.cleanup = db.prepare('DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at <= ?');
  }

  get(sid, callback) {
    try {
      const row = this.getSession.get(sid, Date.now());
      callback(null, row ? JSON.parse(row.data) : null);
    } catch (error) {
      callback(error);
    }
  }

  set(sid, value, callback = () => {}) {
    try {
      const expiresAt = value.cookie?.expires ? Date.parse(value.cookie.expires) : null;
      this.setSession.run(sid, JSON.stringify(value), expiresAt);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sid, value, callback = () => {}) {
    try {
      const expiresAt = value.cookie?.expires ? Date.parse(value.cookie.expires) : null;
      this.touchSession.run(expiresAt, sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      this.deleteSession.run(sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  prune() {
    this.cleanup.run(Date.now());
  }
}

const sessionStore = new SQLiteSessionStore(database);
const pruneTimer = setInterval(() => sessionStore.prune(), 60 * 60 * 1000);
pruneTimer.unref();

const app = express();
if (production) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  return next();
});
app.use(express.json({ limit: '128kb' }));
app.use(session({
  name: 'lexcitizen.sid',
  secret: sessionSecret || crypto.randomBytes(32).toString('hex'),
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: production,
    maxAge: 8 * 60 * 60 * 1000,
  },
}));

app.use('/api', (request, response, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
      && request.get('X-LexCitizen-Request') !== '1') {
    return response.status(403).json({ error: 'This request could not be verified.' });
  }
  return next();
});

const authenticationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many account attempts. Please wait a few minutes and try again.' },
});

const contributionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'You have sent several proposals recently. Please try again later.' },
});

const evidenceDirectory = path.join(path.dirname(databasePath), 'private-evidence');
fs.mkdirSync(evidenceDirectory, { recursive: true });
const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 8, parts: 10 },
  fileFilter(request, file, callback) {
    const supportedTypes = new Set(['application/pdf', 'text/plain', 'image/png', 'image/jpeg']);
    if (!supportedTypes.has(file.mimetype)) {
      return callback(new Error('Attach a PDF, plain-text file, PNG image, or JPEG image.'));
    }
    return callback(null, true);
  },
});

const contributionCategories = new Set([
  'Fundamental rights',
  'Fundamental duties',
  'Constitutional amendments',
  'Constitutional theory',
  'Everyday laws',
  'Law and research',
  'Judicial decisions',
]);

function publicUser(user) {
  return { id: user.id, email: user.email, username: user.username, role: user.role };
}

function authenticated(request, response, next) {
  if (!request.session.user) return response.status(401).json({ error: 'Please sign in to continue.' });
  request.account = database.prepare('SELECT id, email, username, role, approval_status FROM users WHERE id = ?').get(request.session.user.id);
  if (!request.account || request.account.approval_status !== 'approved') {
    return request.session.destroy(() => response.status(401).json({ error: 'Please sign in to continue.' }));
  }
  return next();
}

function validEmail(email) {
  return typeof email === 'string'
    && email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function passwordIssue(password) {
  if (typeof password !== 'string' || password.length < 10 || Buffer.byteLength(password, 'utf8') > 72) {
    return 'Use at least 10 characters and no more than 72 UTF-8 bytes.';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Use a password with at least one letter and one number.';
  }
  return null;
}

app.post('/api/auth/register', authenticationLimiter, async (request, response, next) => {
  try {
    const email = typeof request.body.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const { password } = request.body;
    if (!validEmail(email)) return response.status(400).json({ error: 'Enter a valid email address.' });
    const issue = passwordIssue(password);
    if (issue) return response.status(400).json({ error: issue });

    const passwordHash = await bcrypt.hash(password, 12);
    const id = crypto.randomUUID();
    try {
      database.prepare("INSERT INTO users (id, email, password_hash, role, approval_status) VALUES (?, ?, ?, 'user', 'pending')").run(id, email, passwordHash);
    } catch (error) {
      if (error.message.startsWith('UNIQUE constraint failed: users.email')) {
        return response.status(409).json({ error: 'An account with this email already exists.' });
      }
      throw error;
    }

    return response.status(201).json({ approvalRequired: true });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/login', authenticationLimiter, async (request, response, next) => {
  try {
    const identity = typeof request.body.identity === 'string' ? request.body.identity.trim() : '';
    const { password } = request.body;
    const mode = request.body.mode;
    if (!identity || typeof password !== 'string' || !['user', 'admin'].includes(mode)) {
      return response.status(400).json({ error: 'Enter your account details and choose a valid account type.' });
    }

    const user = database.prepare(`
      SELECT id, email, username, password_hash, role, approval_status
      FROM users
      WHERE email = ? COLLATE NOCASE OR username = ? COLLATE NOCASE
    `).get(identity, identity);
    const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (user && passwordMatches && user.role === mode && user.approval_status !== 'approved') {
      const statusMessage = user.approval_status === 'pending'
        ? 'Your account is awaiting administrator approval.'
        : 'This account request was declined. Contact the site administrator if you need help.';
      return response.status(403).json({ error: statusMessage });
    }
    if (!user || !passwordMatches || user.role !== mode) {
      return response.status(401).json({ error: 'The account details were not recognised for this account type.' });
    }

    database.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    request.session.regenerate((error) => {
      if (error) return next(error);
      request.session.user = { id: user.id };
      if (request.body.remember === true) request.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
      return request.session.save((saveError) => {
        if (saveError) return next(saveError);
        return response.json({ user: publicUser(user) });
      });
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/auth/me', (request, response) => {
  if (!request.session.user) return response.status(401).json({ error: 'Not signed in.' });
  const user = database.prepare('SELECT id, email, username, role FROM users WHERE id = ?').get(request.session.user.id);
  if (!user) {
    return request.session.destroy(() => response.status(401).json({ error: 'Not signed in.' }));
  }
  return response.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', authenticated, (request, response, next) => {
  request.session.destroy((error) => {
    if (error) return next(error);
    response.clearCookie('lexcitizen.sid', { httpOnly: true, sameSite: 'lax', secure: production });
    return response.status(204).end();
  });
});

app.get('/api/materials', (request, response) => {
  const rows = database.prepare(`
    SELECT m.slug, m.title, m.category, m.excerpt, m.source, m.source_url,
      EXISTS (
        SELECT 1 FROM editorial_submissions s
        WHERE s.status = 'approved'
          AND (s.target_material_slug = m.slug OR s.published_material_slug = m.slug)
      ) AS community_updated
    FROM materials m ORDER BY category, title
  `).all();
  return response.json({ materials: rows });
});

app.get('/api/materials/:slug', (request, response) => {
  const material = database.prepare('SELECT * FROM materials WHERE slug = ?').get(request.params.slug);
  if (!material) return response.status(404).json({ error: 'This reading is not available.' });
  return response.json({ material });
});

app.get('/api/me/library', authenticated, (request, response) => {
  const saved = database.prepare(`
    SELECT material_slug AS slug, created_at
    FROM saved_materials WHERE user_id = ? ORDER BY created_at DESC
  `).all(request.session.user.id);
  const progress = database.prepare(`
    SELECT material_slug AS slug, position_percent, updated_at
    FROM reading_progress WHERE user_id = ? ORDER BY updated_at DESC
  `).all(request.session.user.id);
  return response.json({ saved, progress });
});

app.post('/api/me/submissions', authenticated, contributionLimiter, (request, response, next) => {
  evidenceUpload.single('evidence')(request, response, async (uploadError) => {
    if (uploadError) return next(uploadError);
    let evidencePath;
    try {
      const fields = request.body;
      const requestType = fields.requestType;
      const targetMaterialSlug = typeof fields.targetMaterialSlug === 'string' && fields.targetMaterialSlug
        ? fields.targetMaterialSlug
        : null;
      const title = typeof fields.title === 'string' ? fields.title.trim() : '';
      const category = typeof fields.category === 'string' ? fields.category.trim() : '';
      const excerpt = typeof fields.excerpt === 'string' ? fields.excerpt.trim() : '';
      const proposedBody = typeof fields.proposedBody === 'string' ? fields.proposedBody.trim() : '';
      const citation = typeof fields.citation === 'string' ? fields.citation.trim() : '';
      const sourceUrl = typeof fields.sourceUrl === 'string' ? fields.sourceUrl.trim() : '';

      if (!['correction', 'new_article', 'judicial_update'].includes(requestType)) {
        return response.status(400).json({ error: 'Choose an article correction, new legal article, or judicial update.' });
      }
      if (requestType === 'correction' && !targetMaterialSlug) {
        return response.status(400).json({ error: 'Choose an existing reading to correct.' });
      }
      if (targetMaterialSlug && !database.prepare('SELECT 1 FROM materials WHERE slug = ?').get(targetMaterialSlug)) {
        return response.status(404).json({ error: 'The selected reading is not available.' });
      }
      if (title.length < 8 || title.length > 180) {
        return response.status(400).json({ error: 'Give the proposed update a title between 8 and 180 characters.' });
      }
      if (!contributionCategories.has(category)) {
        return response.status(400).json({ error: 'Choose a valid LexCitizen legal topic.' });
      }
      if (excerpt.length < 20 || excerpt.length > 400) {
        return response.status(400).json({ error: 'Write a summary between 20 and 400 characters.' });
      }
      if (proposedBody.length < 80 || proposedBody.length > 20000) {
        return response.status(400).json({ error: 'Write proposed information between 80 and 20,000 characters.' });
      }
      if (citation.length < 12 || citation.length > 1000) {
        return response.status(400).json({ error: 'Provide a specific citation between 12 and 1,000 characters.' });
      }
      if (sourceUrl.length > 2048) {
        return response.status(400).json({ error: 'The source link is too long.' });
      }
      let parsedSourceUrl;
      try {
        parsedSourceUrl = new URL(sourceUrl);
      } catch {
        return response.status(400).json({ error: 'Provide a valid source URL.' });
      }
      if (!['http:', 'https:'].includes(parsedSourceUrl.protocol) || !parsedSourceUrl.hostname.includes('.')) {
        return response.status(400).json({ error: 'Use an official HTTP or HTTPS source URL.' });
      }

      let evidenceStorageName = null;
      let evidenceFilename = null;
      let evidenceMimeType = null;
      let evidenceSize = null;
      if (request.file) {
        const { buffer, mimetype } = request.file;
        const validPdf = mimetype === 'application/pdf' && buffer.subarray(0, 5).toString() === '%PDF-';
        const validPng = mimetype === 'image/png'
          && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const validJpeg = mimetype === 'image/jpeg'
          && buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        const validText = mimetype === 'text/plain' && !buffer.includes(0);
        if (!validPdf && !validPng && !validJpeg && !validText) {
          return response.status(400).json({ error: 'The attachment does not match a supported PDF, text, PNG, or JPEG file.' });
        }
        const extension = { 'application/pdf': '.pdf', 'text/plain': '.txt', 'image/png': '.png', 'image/jpeg': '.jpg' }[mimetype];
        evidenceStorageName = `${crypto.randomUUID()}${extension}`;
        evidenceFilename = path.basename(request.file.originalname).replace(/[\r\n"]/g, '').slice(0, 160) || `supporting-evidence${extension}`;
        evidenceMimeType = mimetype;
        evidenceSize = buffer.length;
        evidencePath = path.join(evidenceDirectory, evidenceStorageName);
        await fs.promises.writeFile(evidencePath, buffer, { flag: 'wx', mode: 0o600 });
      }

      const id = crypto.randomUUID();
      try {
        database.prepare(`
          INSERT INTO editorial_submissions (
            id, user_id, request_type, target_material_slug, proposed_title,
            proposed_category, proposed_excerpt, proposed_body, citation,
            source_url, evidence_filename, evidence_storage_name, evidence_mime_type, evidence_size
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, request.account.id, requestType, targetMaterialSlug, title,
          category, excerpt, proposedBody, citation, parsedSourceUrl.href,
          evidenceFilename, evidenceStorageName, evidenceMimeType, evidenceSize,
        );
      } catch (error) {
        if (evidencePath) await fs.promises.unlink(evidencePath).catch((cleanupError) => console.error('Unable to clean up rejected evidence file:', cleanupError));
        throw error;
      }
      return response.status(201).json({ id, status: 'pending' });
    } catch (error) {
      if (evidencePath) await fs.promises.unlink(evidencePath).catch((cleanupError) => console.error('Unable to clean up rejected evidence file:', cleanupError));
      return next(error);
    }
  });
});

app.get('/api/me/submissions', authenticated, (request, response) => {
  const submissions = database.prepare(`
    SELECT s.id, s.request_type, s.target_material_slug, s.proposed_title, s.proposed_category,
      s.status, s.review_note, s.final_title, s.created_at, s.reviewed_at,
      m.title AS target_title, s.evidence_filename
    FROM editorial_submissions s LEFT JOIN materials m ON m.slug = s.target_material_slug
    WHERE s.user_id = ? ORDER BY s.created_at DESC
  `).all(request.account.id);
  return response.json({ submissions });
});

app.put('/api/me/saved/:slug', authenticated, (request, response) => {
  const exists = database.prepare('SELECT 1 FROM materials WHERE slug = ?').get(request.params.slug);
  if (!exists) return response.status(404).json({ error: 'This reading is not available.' });
  if (request.body.saved === true) {
    database.prepare('INSERT OR IGNORE INTO saved_materials (user_id, material_slug) VALUES (?, ?)').run(request.session.user.id, request.params.slug);
  } else if (request.body.saved === false) {
    database.prepare('DELETE FROM saved_materials WHERE user_id = ? AND material_slug = ?').run(request.session.user.id, request.params.slug);
  } else {
    return response.status(400).json({ error: 'Choose whether this reading should be saved.' });
  }
  return response.json({ saved: request.body.saved });
});

app.put('/api/me/progress/:slug', authenticated, (request, response) => {
  const exists = database.prepare('SELECT 1 FROM materials WHERE slug = ?').get(request.params.slug);
  if (!exists) return response.status(404).json({ error: 'This reading is not available.' });
  const position = request.body.positionPercent;
  if (!Number.isInteger(position) || position < 0 || position > 100) {
    return response.status(400).json({ error: 'Reading progress must be a whole number between 0 and 100.' });
  }
  database.prepare(`
    INSERT INTO reading_progress (user_id, material_slug, position_percent, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, material_slug) DO UPDATE SET
      position_percent = excluded.position_percent,
      updated_at = CURRENT_TIMESTAMP
  `).run(request.session.user.id, request.params.slug, position);
  return response.json({ positionPercent: position });
});

app.get('/api/admin/overview', authenticated, (request, response) => {
  if (request.account.role !== 'admin') return response.status(403).json({ error: 'Administrator access is required.' });
  const overview = database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users) AS accounts,
      (SELECT COUNT(*) FROM users WHERE role = 'user' AND approval_status = 'pending') AS pending_accounts,
      (SELECT COUNT(*) FROM materials) AS materials,
      (SELECT COUNT(*) FROM saved_materials) AS saved_readings,
      (SELECT COUNT(*) FROM editorial_submissions WHERE status = 'pending') AS pending_proposals
  `).get();
  return response.json({ overview });
});

app.get('/api/admin/accounts', authenticated, (request, response) => {
  if (request.account.role !== 'admin') return response.status(403).json({ error: 'Administrator access is required.' });
  const accounts = database.prepare(`
    SELECT id, email, username, role, approval_status, created_at, last_login_at
    FROM users ORDER BY
      CASE WHEN role = 'user' AND approval_status = 'pending' THEN 0 ELSE 1 END,
      COALESCE(last_login_at, created_at) DESC
  `).all();
  const savedReadings = database.prepare(`
    SELECT m.slug, m.title, m.category, s.created_at
    FROM saved_materials s JOIN materials m ON m.slug = s.material_slug
    WHERE s.user_id = ? ORDER BY s.created_at DESC
  `);
  const readingProgress = database.prepare(`
    SELECT m.slug, m.title, m.category, p.position_percent, p.updated_at
    FROM reading_progress p JOIN materials m ON m.slug = p.material_slug
    WHERE p.user_id = ? ORDER BY p.updated_at DESC
  `);
  return response.json({
    accounts: accounts.map((account) => ({
      ...account,
      saved_readings: savedReadings.all(account.id),
      reading_progress: readingProgress.all(account.id),
    })),
  });
});

app.put('/api/admin/accounts/:id/decision', authenticated, (request, response) => {
  if (request.account.role !== 'admin') return response.status(403).json({ error: 'Administrator access is required.' });
  const { decision } = request.body;
  if (!['approve', 'reject'].includes(decision)) {
    return response.status(400).json({ error: 'Choose whether to approve or reject this account request.' });
  }
  const result = database.prepare(`
    UPDATE users SET approval_status = ?
    WHERE id = ? AND role = 'user' AND approval_status = 'pending'
  `).run(decision === 'approve' ? 'approved' : 'rejected', request.params.id);
  if (result.changes === 0) {
    return response.status(409).json({ error: 'This account request is no longer pending or cannot be changed.' });
  }
  return response.json({ id: request.params.id, approval_status: decision === 'approve' ? 'approved' : 'rejected' });
});

app.get('/api/admin/materials', authenticated, (request, response) => {
  if (request.account.role !== 'admin') return response.status(403).json({ error: 'Administrator access is required.' });
  const materials = database.prepare(`
    SELECT m.slug, m.title, m.category, m.excerpt, m.source, m.body,
      (SELECT COUNT(*) FROM saved_materials s WHERE s.material_slug = m.slug) AS saved_count,
      (SELECT COUNT(*) FROM reading_progress p WHERE p.material_slug = m.slug AND p.position_percent > 0) AS started_count,
      (SELECT COUNT(*) FROM reading_progress p WHERE p.material_slug = m.slug AND p.position_percent = 100) AS completed_count
    FROM materials m ORDER BY m.category, m.title
  `).all();
  return response.json({ materials });
});

app.get('/api/admin/submissions', authenticated, (request, response) => {
  if (request.account.role !== 'admin') return response.status(403).json({ error: 'Administrator access is required.' });
  const submissions = database.prepare(`
    SELECT s.id, s.user_id, u.email AS submitter_email, s.request_type,
      s.target_material_slug, m.title AS target_title, s.proposed_title,
      s.proposed_category, s.proposed_excerpt, s.proposed_body, s.citation,
      s.source_url, s.evidence_filename, s.evidence_mime_type, s.evidence_size,
      s.status, s.final_title, s.final_category, s.final_excerpt, s.final_body,
      s.review_note, s.created_at, s.reviewed_at
    FROM editorial_submissions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN materials m ON m.slug = s.target_material_slug
    ORDER BY CASE WHEN s.status = 'pending' THEN 0 ELSE 1 END, s.created_at DESC
  `).all();
  return response.json({ submissions });
});

app.get('/api/admin/submissions/:id/evidence', authenticated, (request, response, next) => {
  if (request.account.role !== 'admin') return response.status(403).json({ error: 'Administrator access is required.' });
  const submission = database.prepare(`
    SELECT evidence_storage_name, evidence_filename, evidence_mime_type
    FROM editorial_submissions WHERE id = ?
  `).get(request.params.id);
  if (!submission || !submission.evidence_storage_name) {
    return response.status(404).json({ error: 'No supporting document is available for this request.' });
  }
  const filePath = path.join(evidenceDirectory, path.basename(submission.evidence_storage_name));
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  return response.download(filePath, submission.evidence_filename, (error) => {
    if (error && !response.headersSent) return next(error);
    return undefined;
  });
});

function slugify(title) {
  return title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'legal-update';
}

app.put('/api/admin/submissions/:id/review', authenticated, (request, response) => {
  if (request.account.role !== 'admin') return response.status(403).json({ error: 'Administrator access is required.' });
  const { decision, reviewNote } = request.body;
  if (!['approve', 'reject'].includes(decision)) {
    return response.status(400).json({ error: 'Choose whether to publish or reject this proposal.' });
  }
  if (typeof reviewNote !== 'string' || reviewNote.trim().length < (decision === 'reject' ? 8 : 0) || reviewNote.length > 2000) {
    return response.status(400).json({ error: decision === 'reject'
      ? 'Explain why this proposal is being rejected (at least 8 characters).'
      : 'The editorial note must be 2,000 characters or fewer.' });
  }

  const submission = database.prepare('SELECT * FROM editorial_submissions WHERE id = ?').get(request.params.id);
  if (!submission || submission.status !== 'pending') {
    return response.status(409).json({ error: 'This proposal is no longer pending review.' });
  }
  const reviewedAt = new Date().toISOString();

  if (decision === 'reject') {
    database.prepare(`
      UPDATE editorial_submissions
      SET status = 'rejected', review_note = ?, reviewed_by = ?, reviewed_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(reviewNote.trim(), request.account.id, reviewedAt, submission.id);
    return response.json({ id: submission.id, status: 'rejected' });
  }

  const { finalTitle, finalCategory, finalExcerpt, finalBody, finalCitation, finalSourceUrl } = request.body;
  if (typeof finalTitle !== 'string' || finalTitle.trim().length < 8 || finalTitle.trim().length > 180
      || typeof finalCategory !== 'string' || !contributionCategories.has(finalCategory.trim())
      || typeof finalExcerpt !== 'string' || finalExcerpt.trim().length < 20 || finalExcerpt.trim().length > 400
      || typeof finalBody !== 'string' || finalBody.trim().length < 80 || finalBody.trim().length > 20000
      || typeof finalCitation !== 'string' || finalCitation.trim().length < 12 || finalCitation.trim().length > 1000
      || typeof finalSourceUrl !== 'string' || finalSourceUrl.length > 2048) {
    return response.status(400).json({ error: 'Review and complete the final title, topic, summary, article text, citation, and source URL before publishing.' });
  }
  let sourceUrl;
  try {
    sourceUrl = new URL(finalSourceUrl.trim());
  } catch {
    return response.status(400).json({ error: 'The final source URL is invalid.' });
  }
  if (!['http:', 'https:'].includes(sourceUrl.protocol) || !sourceUrl.hostname.includes('.')) {
    return response.status(400).json({ error: 'The final source must use a valid HTTP or HTTPS URL.' });
  }

  let materialSlug = submission.target_material_slug;
  if (submission.request_type === 'new_article' || !materialSlug) {
    const baseSlug = slugify(finalTitle.trim());
    materialSlug = baseSlug;
    let suffix = 1;
    while (database.prepare('SELECT 1 FROM materials WHERE slug = ?').get(materialSlug)) {
      suffix += 1;
      materialSlug = `${baseSlug}-${suffix}`;
    }
  } else if (!database.prepare('SELECT 1 FROM materials WHERE slug = ?').get(materialSlug)) {
    return response.status(409).json({ error: 'The article this proposal refers to no longer exists.' });
  }

  database.exec('BEGIN');
  try {
    if (submission.request_type === 'new_article' || !submission.target_material_slug) {
      database.prepare(`
        INSERT INTO materials (slug, title, category, excerpt, body, source, source_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(materialSlug, finalTitle.trim(), finalCategory.trim(), finalExcerpt.trim(), finalBody.trim(), finalCitation.trim(), sourceUrl.href);
    } else {
      database.prepare(`
        UPDATE materials SET title = ?, category = ?, excerpt = ?, body = ?, source = ?, source_url = ?
        WHERE slug = ?
      `).run(finalTitle.trim(), finalCategory.trim(), finalExcerpt.trim(), finalBody.trim(), finalCitation.trim(), sourceUrl.href, materialSlug);
    }
    const result = database.prepare(`
      UPDATE editorial_submissions SET
        status = 'approved', final_title = ?, final_category = ?, final_excerpt = ?,
        final_body = ?, final_citation = ?, final_source_url = ?, published_material_slug = ?, review_note = ?,
        reviewed_by = ?, reviewed_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(
      finalTitle.trim(), finalCategory.trim(), finalExcerpt.trim(), finalBody.trim(),
      finalCitation.trim(), sourceUrl.href, materialSlug, reviewNote.trim(), request.account.id, reviewedAt, submission.id,
    );
    if (result.changes !== 1) throw new Error('The proposal changed while it was being reviewed.');
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return response.json({ id: submission.id, status: 'approved', materialSlug });
});

app.use((request, response, next) => {
  let requestedPath;
  try {
    requestedPath = path.normalize(decodeURIComponent(request.path)).replace(/\\/g, '/').toLowerCase();
  } catch {
    return response.sendStatus(400);
  }
  const relativeDatabasePath = path.relative(projectDirectory, databasePath).replace(/\\/g, '/').toLowerCase();
  const databaseFiles = relativeDatabasePath && !relativeDatabasePath.startsWith('../')
    ? [relativeDatabasePath, `${relativeDatabasePath}-wal`, `${relativeDatabasePath}-shm`, `${relativeDatabasePath}-journal`]
    : [];
  if (/^\/(?:data|private-evidence|node_modules|test|\.git)(?:\/|$)/.test(requestedPath)
      || /\.(?:sqlite|sqlite3|db)(?:-(?:wal|shm|journal))?$/.test(requestedPath)
      || databaseFiles.some((file) => requestedPath === `/${file}`)
      || /^\/(?:server\.js|package(?:-lock)?\.json|readme\.md|\.env\.example)$/.test(requestedPath)) {
    return response.sendStatus(404);
  }
  return next();
});

app.use(express.static(projectDirectory, { extensions: ['html'] }));
app.use((error, request, response, next) => {
  if (response.headersSent) return next(error);
  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return response.status(status).json({ error: status === 413
      ? 'Supporting documents must be no larger than 5 MB.'
      : 'Attach only one supported evidence file.' });
  }
  if (error.message === 'Attach a PDF, plain-text file, PNG image, or JPEG image.') {
    return response.status(400).json({ error: error.message });
  }
  const status = Number(error.status);
  if (status >= 500 || !Number.isInteger(status)) console.error('Request failed:', error);
  const safeStatus = status >= 400 && status < 500 ? status : 500;
  const message = safeStatus === 413
    ? 'The request body is too large.'
    : safeStatus === 400
      ? 'The request body is invalid.'
      : 'The request could not be completed. Please try again.';
  return response.status(safeStatus).json({ error: message });
});

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => {
  console.log(`LexCitizen is available at http://localhost:${port}`);
});

function close() {
  server.close(() => {
    clearInterval(pruneTimer);
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', close);
process.on('SIGTERM', close);

module.exports = { app, database };
