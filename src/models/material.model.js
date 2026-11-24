const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  category: { type: String, required: true },
  excerpt: { type: String, required: true },
  body: { type: String, required: true },
  source: { type: String, required: true },
  source_url: { type: String, default: '' },
  record_type: { type: String, enum: ['learning_material', 'central_act'], default: 'learning_material', index: true },
  source_provider: { type: String, default: null, index: true },
  source_item_id: { type: String, default: null },
  source_updated_at: { type: Date, default: null },
  imported_at: { type: Date, default: null },
  act_number: { type: String, default: null },
  act_year: { type: Number, default: null },
  ministry: { type: String, default: null },
  legal_status: { type: String, default: null },
  official_text_available: { type: Boolean, default: false },
  content_completeness: {
    type: String,
    enum: ['full_text', 'preamble', 'abstract', 'source_link'],
    default: 'source_link',
  },
  source_metadata: { type: mongoose.Schema.Types.Mixed, default: null, select: false },
});

materialSchema.index(
  { source_provider: 1, source_item_id: 1 },
  { unique: true, partialFilterExpression: { source_item_id: { $type: 'string' } } },
);

module.exports = mongoose.model('Material', materialSchema, 'content');
