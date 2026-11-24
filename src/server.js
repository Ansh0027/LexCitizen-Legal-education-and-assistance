const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const MongoSessionStore = require('./modules/mongo-session-store');
const { scheduleDailySync } = require('./modules/central-acts-sync');
const registerApiRoutes = require('./routes/api.routes');
const pageRoutes = require('./routes/page.routes');
const errorHandler = require('./middleware/error-handler');
const {
  connectDatabase,
  evidenceDirectory,
  mongoose,
  production,
  projectDirectory,
  publicDirectory,
  sessionSecret,
} = require('./config/database');

const app = express();
let server;
let dailySyncTimer;

async function start() {
  await connectDatabase();

  app.set('view engine', 'ejs');
  app.set('views', path.join(projectDirectory, 'src', 'views'));
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
    store: new MongoSessionStore(mongoose.connection.db.collection('sessions')),
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
  registerApiRoutes(app, { evidenceDirectory, production });
  app.use(pageRoutes);
  app.use(express.static(publicDirectory));
  app.use(errorHandler);

  const port = Number(process.env.PORT) || 3000;
  server = app.listen(port, () => {
    console.log(`LexCitizen is available at http://localhost:${port}`);
  });
  dailySyncTimer = scheduleDailySync();
  return server;
}

async function close() {
  if (dailySyncTimer) clearInterval(dailySyncTimer);
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Unable to start LexCitizen:', error);
    process.exitCode = 1;
  });

  process.once('SIGINT', () => close().then(() => process.exit(0)).catch((error) => {
    console.error('Unable to close LexCitizen cleanly:', error);
    process.exit(1);
  }));
  process.once('SIGTERM', () => close().then(() => process.exit(0)).catch((error) => {
    console.error('Unable to close LexCitizen cleanly:', error);
    process.exit(1);
  }));
}

module.exports = { app, close, start };
