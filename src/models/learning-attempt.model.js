const mongoose = require('mongoose');

const learningAnswerSchema = new mongoose.Schema({
  question_id: { type: String, required: true },
  choice_id: { type: String, required: true },
  is_correct: { type: Boolean, required: true },
}, { _id: false });

const learningAttemptSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  material_slug: { type: String, required: true },
  assessment_type: { type: String, enum: ['practice', 'quiz', 'test'], required: true },
  score: { type: Number, min: 0, required: true },
  max_score: { type: Number, min: 1, required: true },
  percentage: { type: Number, min: 0, max: 100, required: true },
  answers: { type: [learningAnswerSchema], required: true },
  created_at: { type: Date, default: Date.now },
});

learningAttemptSchema.index({ user_id: 1, created_at: -1 });
learningAttemptSchema.index({ user_id: 1, material_slug: 1, assessment_type: 1 });

module.exports = mongoose.model('LearningAttempt', learningAttemptSchema, 'learning_attempts');
