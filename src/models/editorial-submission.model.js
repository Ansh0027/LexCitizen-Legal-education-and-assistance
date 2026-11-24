const crypto = require('node:crypto');
const mongoose = require('mongoose');

const editorialSubmissionSchema = new mongoose.Schema({
  _id: { type: String, default: () => crypto.randomUUID() },
  user_id: { type: String, required: true },
  request_type: { type: String, enum: ['correction', 'new_article', 'judicial_update'], required: true },
  target_material_slug: { type: String, default: null },
  proposed_title: { type: String, required: true },
  proposed_category: { type: String, required: true },
  proposed_excerpt: { type: String, required: true },
  proposed_body: { type: String, required: true },
  citation: { type: String, required: true },
  source_url: { type: String, required: true },
  evidence_filename: { type: String, default: null },
  evidence_storage_name: { type: String, default: null },
  evidence_mime_type: { type: String, default: null },
  evidence_size: { type: Number, default: null },
  status: { type: String, enum: ['pending', 'reviewing', 'approved', 'rejected'], default: 'pending', required: true },
  final_title: { type: String, default: null },
  final_category: { type: String, default: null },
  final_excerpt: { type: String, default: null },
  final_body: { type: String, default: null },
  final_citation: { type: String, default: null },
  final_source_url: { type: String, default: null },
  published_material_slug: { type: String, default: null },
  review_note: { type: String, default: null },
  reviewed_by: { type: String, default: null },
  reviewed_at: { type: Date, default: null },
  review_material_slug: { type: String, default: null },
  review_created_material: { type: Boolean, default: false },
  review_previous_material: { type: mongoose.Schema.Types.Mixed, default: null },
  created_at: { type: Date, default: Date.now },
});

editorialSubmissionSchema.index({ status: 1, created_at: -1 });
editorialSubmissionSchema.index({ user_id: 1, created_at: -1 });

module.exports = mongoose.model('EditorialSubmission', editorialSubmissionSchema, 'editorial_submissions');
