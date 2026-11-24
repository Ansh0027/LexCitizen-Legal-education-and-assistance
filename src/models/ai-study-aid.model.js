const crypto = require('node:crypto');
const mongoose = require('mongoose');

const aiStudyAidSchema = new mongoose.Schema({
  _id: { type: String, default: () => crypto.randomUUID() },
  user_id: { type: String, required: true },
  material_slug: { type: String, required: true },
  type: { type: String, enum: ['summary', 'flashcards', 'notes'], required: true },
  content: { type: mongoose.Schema.Types.Mixed, required: true },
  model: { type: String, required: true },
  material_fingerprint: { type: String, required: true },
  generated_at: { type: Date, default: Date.now, required: true },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

aiStudyAidSchema.index({ user_id: 1, material_slug: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('AIStudyAid', aiStudyAidSchema, 'ai_study_aids');
