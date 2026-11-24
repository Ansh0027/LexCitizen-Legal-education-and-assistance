const crypto = require('node:crypto');
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  _id: { type: String, default: () => crypto.randomUUID() },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  username: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
  password_hash: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user', required: true },
  created_at: { type: Date, default: Date.now },
  last_login_at: { type: Date, default: null },
});

module.exports = mongoose.model('User', userSchema, 'users');
