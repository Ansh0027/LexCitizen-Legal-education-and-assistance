const mongoose = require('mongoose');

const savedMaterialSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  material_slug: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
});

savedMaterialSchema.index({ user_id: 1, material_slug: 1 }, { unique: true });

module.exports = mongoose.model('SavedMaterial', savedMaterialSchema, 'saved_materials');
