require('dotenv').config({ path: require('node:path').resolve(__dirname, '..', '..', '.env') });

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const defaultMaterials = require('../data/default-materials');
const models = require('../models');

const production = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;
if (production && (!sessionSecret || sessionSecret.length < 32)) {
  throw new Error('Set SESSION_SECRET to a random value at least 32 characters long in production.');
}

const projectDirectory = path.resolve(__dirname, '..', '..');
const publicDirectory = path.join(projectDirectory, 'public');
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/LexCitizen';
const evidenceDirectory = path.resolve(
  projectDirectory,
  process.env.EVIDENCE_PATH || './data/private-evidence',
);

async function recoverInterruptedReviews() {
  const interruptedReviews = await models.EditorialSubmission.find({ status: 'reviewing' }).lean();
  for (const submission of interruptedReviews) {
    if (submission.review_created_material && submission.review_material_slug) {
      await models.Material.deleteOne({ slug: submission.review_material_slug });
    } else if (submission.review_previous_material) {
      const { _id, __v, ...previousMaterial } = submission.review_previous_material;
      await models.Material.updateOne(
        { slug: previousMaterial.slug },
        { $set: previousMaterial },
      );
    }
    await models.EditorialSubmission.updateOne(
      { _id: submission._id, status: 'reviewing' },
      {
        $set: { status: 'pending', review_created_material: false, review_previous_material: null, review_material_slug: null },
      },
    );
  }
}

async function migrateLegacyMaterials() {
  const legacyExists = await mongoose.connection.db.listCollections(
    { name: 'materials' },
    { nameOnly: true },
  ).hasNext();
  if (!legacyExists) return;

  const legacyMaterials = mongoose.connection.db.collection('materials');
  const cursor = legacyMaterials.find({});
  let migrated = 0;
  for await (const legacyMaterial of cursor) {
    const { _id, __v, ...record } = legacyMaterial;
    const result = await mongoose.connection.db.collection('content').updateOne(
      { slug: record.slug },
      { $setOnInsert: { ...record, record_type: record.record_type || 'learning_material' } },
      { upsert: true },
    );
    if (result.upsertedCount) migrated += 1;
  }
  if (migrated) console.log(`Migrated ${migrated} legacy reading(s) into the content collection.`);
}

async function connectDatabase() {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  await Promise.all(Object.values(models).map((model) => model.init()));
  const removedApprovalFlags = await mongoose.connection.db.collection('users').updateMany(
    { approval_status: { $exists: true } },
    { $unset: { approval_status: '' } },
  );
  if (removedApprovalFlags.modifiedCount) {
    console.log(`Removed obsolete approval flags from ${removedApprovalFlags.modifiedCount} account(s).`);
  }
  await mongoose.connection.db.collection('sessions').createIndex(
    { expires_at: 1 },
    { expireAfterSeconds: 0 },
  );
  fs.mkdirSync(evidenceDirectory, { recursive: true });

  await migrateLegacyMaterials();

  await Promise.all(defaultMaterials.map((material) => models.Material.updateOne(
    { slug: material.slug },
    { $setOnInsert: material },
    { upsert: true },
  )));

  await recoverInterruptedReviews();

  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    if (process.env.ADMIN_PASSWORD.length < 12 || Buffer.byteLength(process.env.ADMIN_PASSWORD, 'utf8') > 72) {
      throw new Error('ADMIN_PASSWORD must be at least 12 characters and no more than 72 UTF-8 bytes.');
    }
    const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('ADMIN_EMAIL must be a valid email address.');
    }
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await models.User.findOneAndUpdate(
      { email },
      {
        $set: {
          username: 'admin',
          password_hash: passwordHash,
          role: 'admin',
        },
        $setOnInsert: { _id: crypto.randomUUID() },
      },
      { upsert: true, runValidators: true },
    );
  }

  return { evidenceDirectory, models, mongoUri, mongoose };
}

module.exports = {
  connectDatabase,
  evidenceDirectory,
  models,
  mongoUri,
  mongoose,
  production,
  projectDirectory,
  publicDirectory,
  sessionSecret,
};
