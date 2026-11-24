const mongoose = require('mongoose');

const readingProgressSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  material_slug: { type: String, required: true },
  position_percent: { type: Number, min: 0, max: 100, required: true, default: 0 },
  updated_at: { type: Date, default: Date.now },
});

readingProgressSchema.index({ user_id: 1, material_slug: 1 }, { unique: true });

module.exports = mongoose.model('ReadingProgress', readingProgressSchema, 'reading_progress');
