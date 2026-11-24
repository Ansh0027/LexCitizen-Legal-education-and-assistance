const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const multer = require('multer');
const models = require('../models');
const { assessmentTypes, getPublicAssessments, gradeAssessment } = require('../modules/learning-assessments');
const {
  fingerprintMaterial,
  generateStudyAid,
  StudyAidError,
} = require('../modules/openai-study-aids');

const authenticationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 100 : 10,
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

const learningAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'You have submitted several learning attempts recently. Please try again later.' },
});

const aiStudyAidLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'You have reached the AI study-tool limit. Please try again later.' },
});

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

function stripMongoFields(document) {
  const { _id, __v, ...record } = document;
  return record;
}

function publicUser(user) {
  return { id: user.id, email: user.email, username: user.username, role: user.role };
}

async function authenticated(request, response, next) {
  if (!request.session.user) return response.status(401).json({ error: 'Please sign in to continue.' });
  const account = await models.User.findById(request.session.user.id).select('email username role');
  if (!account) {
    return request.session.destroy(() => response.status(401).json({ error: 'Please sign in to continue.' }));
  }
  request.account = account;
  return next();
}

function administrator(request, response) {
  return request.account.role !== 'admin'
    ? response.status(403).json({ error: 'Administrator access is required.' })
    : null;
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

function slugify(title) {
  return title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'legal-update';
}

function isDuplicateKey(error, keyPattern) {
  return error.code === 11000 && (!keyPattern || Object.keys(keyPattern).some((key) => key === 'email'));
}

module.exports = function registerApiRoutes(app, { evidenceDirectory, production }) {
  app.post('/api/auth/register', authenticationLimiter, async (request, response) => {
    const email = typeof request.body.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const { password } = request.body;
    if (!validEmail(email)) return response.status(400).json({ error: 'Enter a valid email address.' });
    const issue = passwordIssue(password);
    if (issue) return response.status(400).json({ error: issue });

    try {
      await models.User.create({
        email,
        password_hash: await bcrypt.hash(password, 12),
        role: 'user',
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        return response.status(409).json({ error: 'An account with this email already exists.' });
      }
      throw error;
    }
    return response.status(201).json({ created: true });
  });

  app.post('/api/auth/login', authenticationLimiter, async (request, response, next) => {
    const identity = typeof request.body.identity === 'string' ? request.body.identity.trim().toLowerCase() : '';
    const { password, mode } = request.body;
    if (!identity || typeof password !== 'string' || !['user', 'admin'].includes(mode)) {
      return response.status(400).json({ error: 'Enter your account details and choose a valid account type.' });
    }

    const user = await models.User.findOne({
      $or: [{ email: identity }, { username: identity }],
    }).select('+password_hash');
    const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || !passwordMatches || user.role !== mode) {
      return response.status(401).json({ error: 'The account details were not recognised for this account type.' });
    }

    await models.User.updateOne({ _id: user.id }, { $set: { last_login_at: new Date() } });
    request.session.regenerate((error) => {
      if (error) return next(error);
      request.session.user = { id: user.id };
      if (request.body.remember === true) request.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
      return request.session.save((saveError) => {
        if (saveError) return next(saveError);
        return response.json({ user: publicUser(user) });
      });
    });
  });

  app.get('/api/auth/me', async (request, response) => {
    if (!request.session.user) return response.status(401).json({ error: 'Not signed in.' });
    const user = await models.User.findById(request.session.user.id).select('email username role');
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

  app.get('/api/materials', async (request, response) => {
    const [materials, updatedTargets, updatedPublications] = await Promise.all([
      models.Material.find().select('-body -source_metadata').sort({ category: 1, title: 1 }).lean(),
      models.EditorialSubmission.distinct('target_material_slug', { status: 'approved' }),
      models.EditorialSubmission.distinct('published_material_slug', { status: 'approved' }),
    ]);
    const communityUpdates = new Set([...updatedTargets, ...updatedPublications].filter(Boolean));
    return response.json({
      materials: materials.map((material) => {
        const { _id, __v, ...record } = material;
        return { ...record, community_updated: communityUpdates.has(material.slug) ? 1 : 0 };
      }),
    });
  });

  app.get('/api/materials/:slug', async (request, response) => {
    const material = await models.Material.findOne({ slug: request.params.slug }).lean();
    if (!material) return response.status(404).json({ error: 'This reading is not available.' });
    return response.json({ material: stripMongoFields(material) });
  });

  app.get('/api/materials/:slug/assessments', async (request, response) => {
    const material = await models.Material.findOne({ slug: request.params.slug }).lean();
    if (!material) return response.status(404).json({ error: 'This reading is not available.' });
    return response.json({ assessments: getPublicAssessments(material) });
  });

  app.get('/api/me/library', authenticated, async (request, response) => {
    const [savedRecords, progressRecords] = await Promise.all([
      models.SavedMaterial.find({ user_id: request.account.id }).sort({ created_at: -1 }).lean(),
      models.ReadingProgress.find({ user_id: request.account.id }).sort({ updated_at: -1 }).lean(),
    ]);
    const saved = savedRecords.map(({ material_slug, created_at }) => ({ slug: material_slug, created_at }));
    const progress = progressRecords.map(({ material_slug, position_percent, updated_at }) => ({
      slug: material_slug, position_percent, updated_at,
    }));
    return response.json({ saved, progress });
  });

  app.get('/api/me/study-aids/:slug', authenticated, async (request, response) => {
    const material = await models.Material.findOne({ slug: request.params.slug })
      .select('slug title category excerpt source body').lean();
    if (!material) return response.status(404).json({ error: 'This reading is not available.' });

    const fingerprint = fingerprintMaterial(material);
    const records = await models.AIStudyAid.find({
      user_id: request.account.id,
      material_slug: material.slug,
    }).select('type content model generated_at updated_at material_fingerprint').lean();
    const aids = Object.fromEntries(records.map((record) => [record.type, {
      type: record.type,
      content: record.content,
      model: record.model,
      generated_at: record.generated_at,
      updated_at: record.updated_at,
      stale: record.material_fingerprint !== fingerprint,
    }]));
    return response.json({ aids });
  });

  app.post('/api/me/study-aids/:slug', authenticated, aiStudyAidLimiter, async (request, response) => {
    const payload = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
      ? request.body
      : {};
    if (!['summary', 'flashcards', 'notes'].includes(payload.type)) {
      return response.status(400).json({ error: 'Choose summary, flashcards, or short notes.' });
    }
    if (payload.force !== undefined && typeof payload.force !== 'boolean') {
      return response.status(400).json({ error: 'The regenerate option must be true or false.' });
    }

    const material = await models.Material.findOne({ slug: request.params.slug })
      .select('slug title category excerpt source body').lean();
    if (!material) return response.status(404).json({ error: 'This reading is not available.' });
    const fingerprint = fingerprintMaterial(material);
    const existing = await models.AIStudyAid.findOne({
      user_id: request.account.id,
      material_slug: material.slug,
      type: payload.type,
    }).lean();
    if (existing && existing.material_fingerprint === fingerprint && payload.force !== true) {
      return response.json({
        aid: {
          type: existing.type,
          content: existing.content,
          model: existing.model,
          generated_at: existing.generated_at,
          updated_at: existing.updated_at,
          stale: false,
        },
        cached: true,
      });
    }

    let generated;
    try {
      generated = await generateStudyAid(payload.type, material);
    } catch (error) {
      if (error instanceof StudyAidError) {
        return response.status(error.status).json({ error: error.message });
      }
      throw error;
    }

    let aid;
    try {
      aid = await models.AIStudyAid.findOneAndUpdate(
        { user_id: request.account.id, material_slug: material.slug, type: payload.type },
        {
          $set: {
            content: generated.content,
            model: generated.model,
            material_fingerprint: fingerprint,
            generated_at: new Date(),
          },
          $setOnInsert: {
            user_id: request.account.id,
            material_slug: material.slug,
            type: payload.type,
          },
        },
        { new: true, upsert: true, runValidators: true },
      ).lean();
    } catch (error) {
      if (error.code !== 11000) throw error;
      aid = await models.AIStudyAid.findOne({
        user_id: request.account.id,
        material_slug: material.slug,
        type: payload.type,
      }).lean();
      if (!aid) throw error;
    }

    return response.json({
      aid: {
        type: aid.type,
        content: aid.content,
        model: aid.model,
        generated_at: aid.generated_at,
        updated_at: aid.updated_at,
        stale: false,
      },
      cached: false,
    });
  });

  app.get('/api/me/assessments', authenticated, async (request, response) => {
    const offset = Number(request.query.offset || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000) {
      return response.status(400).json({ error: 'Learning-history offset must be a non-negative whole number.' });
    }
    const [summaryRows, attemptRecords] = await Promise.all([
      models.LearningAttempt.aggregate([
        { $match: { user_id: request.account.id } },
        {
          $group: {
            _id: null,
            attemptCount: { $sum: 1 },
            correctAnswers: { $sum: '$score' },
            totalQuestions: { $sum: '$max_score' },
            bestPercentage: { $max: '$percentage' },
          },
        },
      ]),
      models.LearningAttempt.find({ user_id: request.account.id })
        .sort({ created_at: -1, _id: -1 }).skip(offset).limit(51).lean(),
    ]);
    const summary = summaryRows[0] || {};
    const totalQuestions = summary.totalQuestions || 0;
    const hasMore = attemptRecords.length > 50;
    const attempts = attemptRecords.slice(0, 50);
    return response.json({
      performance: {
        attemptCount: summary.attemptCount || 0,
        correctAnswers: summary.correctAnswers || 0,
        totalQuestions,
        overallAccuracy: totalQuestions ? Math.round((summary.correctAnswers / totalQuestions) * 100) : 0,
        bestPercentage: summary.bestPercentage || 0,
      },
      attempts: attempts.map(({ _id, __v, answers, ...attempt }) => ({ ...attempt, id: String(_id) })),
      nextOffset: offset + attempts.length,
      hasMore,
    });
  });

  app.post('/api/me/assessments', authenticated, learningAttemptLimiter, async (request, response) => {
    const payload = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
      ? request.body
      : {};
    if (typeof payload.slug !== 'string' || payload.slug.length > 100
        || !assessmentTypes.includes(payload.type)) {
      return response.status(400).json({ error: 'Choose a valid reading and assessment type.' });
    }

    const material = await models.Material.findOne({ slug: payload.slug }).lean();
    if (!material) return response.status(404).json({ error: 'This reading is not available.' });
    const graded = gradeAssessment(material, payload.type, payload.answers);
    if (!graded) {
      return response.status(400).json({ error: 'Answer every question using one of its listed choices.' });
    }

    const attempt = await models.LearningAttempt.create({
      user_id: request.account.id,
      material_slug: material.slug,
      assessment_type: payload.type,
      score: graded.score,
      max_score: graded.maxScore,
      percentage: graded.percentage,
      answers: graded.results.map((result) => ({
        question_id: result.questionId,
        choice_id: result.choiceId,
        is_correct: result.isCorrect,
      })),
    });
    return response.status(201).json({
      attempt: {
        id: attempt.id,
        slug: attempt.material_slug,
        type: attempt.assessment_type,
        score: attempt.score,
        maxScore: attempt.max_score,
        percentage: attempt.percentage,
        createdAt: attempt.created_at,
      },
      results: graded.results,
    });
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
        if (targetMaterialSlug && !await models.Material.exists({ slug: targetMaterialSlug })) {
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
          evidenceFilename = path.basename(request.file.originalname).replace(/[\r\n"]/g, '').slice(0, 160)
            || `supporting-evidence${extension}`;
          evidenceMimeType = mimetype;
          evidenceSize = buffer.length;
          evidencePath = path.join(evidenceDirectory, evidenceStorageName);
          await fs.promises.writeFile(evidencePath, buffer, { flag: 'wx', mode: 0o600 });
        }

        const submission = await models.EditorialSubmission.create({
          _id: crypto.randomUUID(),
          user_id: request.account.id,
          request_type: requestType,
          target_material_slug: targetMaterialSlug,
          proposed_title: title,
          proposed_category: category,
          proposed_excerpt: excerpt,
          proposed_body: proposedBody,
          citation,
          source_url: parsedSourceUrl.href,
          evidence_filename: evidenceFilename,
          evidence_storage_name: evidenceStorageName,
          evidence_mime_type: evidenceMimeType,
          evidence_size: evidenceSize,
        });
        return response.status(201).json({ id: submission.id, status: 'pending' });
      } catch (error) {
        if (evidencePath) {
          await fs.promises.unlink(evidencePath)
            .catch((cleanupError) => console.error('Unable to clean up rejected evidence file:', cleanupError));
        }
        return next(error);
      }
    });
  });

  app.get('/api/me/submissions', authenticated, async (request, response) => {
    const submissions = await models.EditorialSubmission.find({ user_id: request.account.id })
      .sort({ created_at: -1 }).lean();
    const targetSlugs = [...new Set(submissions.map((item) => item.target_material_slug).filter(Boolean))];
    const materials = await models.Material.find({ slug: { $in: targetSlugs } }).select('slug title').lean();
    const titlesBySlug = new Map(materials.map((material) => [material.slug, material.title]));
    return response.json({
      submissions: submissions.map((submission) => {
        const { _id, __v, target_material_slug, ...record } = submission;
        return {
          id: _id,
          ...record,
          target_material_slug,
          target_title: titlesBySlug.get(target_material_slug) || null,
        };
      }),
    });
  });

  app.put('/api/me/saved/:slug', authenticated, async (request, response) => {
    const slug = request.params.slug;
    if (!await models.Material.exists({ slug })) {
      return response.status(404).json({ error: 'This reading is not available.' });
    }
    if (request.body.saved === true) {
      await models.SavedMaterial.updateOne(
        { user_id: request.account.id, material_slug: slug },
        { $setOnInsert: { created_at: new Date() } },
        { upsert: true },
      );
    } else if (request.body.saved === false) {
      await models.SavedMaterial.deleteOne({ user_id: request.account.id, material_slug: slug });
    } else {
      return response.status(400).json({ error: 'Choose whether this reading should be saved.' });
    }
    return response.json({ saved: request.body.saved });
  });

  app.put('/api/me/progress/:slug', authenticated, async (request, response) => {
    const slug = request.params.slug;
    if (!await models.Material.exists({ slug })) {
      return response.status(404).json({ error: 'This reading is not available.' });
    }
    const position = request.body.positionPercent;
    if (!Number.isInteger(position) || position < 0 || position > 100) {
      return response.status(400).json({ error: 'Reading progress must be a whole number between 0 and 100.' });
    }
    await models.ReadingProgress.updateOne(
      { user_id: request.account.id, material_slug: slug },
      { $set: { position_percent: position, updated_at: new Date() } },
      { upsert: true, runValidators: true },
    );
    return response.json({ positionPercent: position });
  });

  app.get('/api/admin/overview', authenticated, async (request, response) => {
    const forbidden = administrator(request, response);
    if (forbidden) return forbidden;
    const [accounts, materialCount, savedReadings, pendingProposals] = await Promise.all([
      models.User.countDocuments(),
      models.Material.countDocuments(),
      models.SavedMaterial.countDocuments(),
      models.EditorialSubmission.countDocuments({ status: 'pending' }),
    ]);
    return response.json({
      overview: {
        accounts,
        materials: materialCount,
        saved_readings: savedReadings,
        pending_proposals: pendingProposals,
      },
    });
  });

  app.get('/api/admin/accounts', authenticated, async (request, response) => {
    const forbidden = administrator(request, response);
    if (forbidden) return forbidden;
    const accounts = await models.User.find()
      .select('email username role created_at last_login_at').lean();
    accounts.sort((left, right) => {
      const leftDate = left.last_login_at || left.created_at;
      const rightDate = right.last_login_at || right.created_at;
      return new Date(rightDate) - new Date(leftDate);
    });

    const ids = accounts.map((account) => account._id);
    const [savedRecords, progressRecords] = await Promise.all([
      models.SavedMaterial.find({ user_id: { $in: ids } }).sort({ created_at: -1 }).lean(),
      models.ReadingProgress.find({ user_id: { $in: ids } }).sort({ updated_at: -1 }).lean(),
    ]);
    const slugs = [...new Set([
      ...savedRecords.map((record) => record.material_slug),
      ...progressRecords.map((record) => record.material_slug),
    ])];
    const materials = await models.Material.find({ slug: { $in: slugs } }).select('slug title category').lean();
    const materialsBySlug = new Map(materials.map((material) => [material.slug, material]));
    const savedByUser = new Map();
    const progressByUser = new Map();
    for (const saved of savedRecords) {
      const material = materialsBySlug.get(saved.material_slug);
      if (!material) continue;
      const record = {
        slug: material.slug, title: material.title, category: material.category, created_at: saved.created_at,
      };
      savedByUser.set(saved.user_id, [...(savedByUser.get(saved.user_id) || []), record]);
    }
    for (const progress of progressRecords) {
      const material = materialsBySlug.get(progress.material_slug);
      if (!material) continue;
      const record = {
        slug: material.slug, title: material.title, category: material.category,
        position_percent: progress.position_percent, updated_at: progress.updated_at,
      };
      progressByUser.set(progress.user_id, [...(progressByUser.get(progress.user_id) || []), record]);
    }
    return response.json({
      accounts: accounts.map((account) => {
        const { _id, ...record } = account;
        return {
          id: _id,
          ...record,
          saved_readings: savedByUser.get(_id) || [],
          reading_progress: progressByUser.get(_id) || [],
        };
      }),
    });
  });

  app.get('/api/admin/materials', authenticated, async (request, response) => {
    const forbidden = administrator(request, response);
    if (forbidden) return forbidden;
    const [materials, savedCounts, progressCounts] = await Promise.all([
      models.Material.find().select('-body -source_metadata').sort({ category: 1, title: 1 }).lean(),
      models.SavedMaterial.aggregate([{ $group: { _id: '$material_slug', count: { $sum: 1 } } }]),
      models.ReadingProgress.aggregate([{
        $group: {
          _id: '$material_slug',
          started_count: { $sum: { $cond: [{ $gt: ['$position_percent', 0] }, 1, 0] } },
          completed_count: { $sum: { $cond: [{ $eq: ['$position_percent', 100] }, 1, 0] } },
        },
      }]),
    ]);
    const savedBySlug = new Map(savedCounts.map((record) => [record._id, record.count]));
    const progressBySlug = new Map(progressCounts.map((record) => [record._id, record]));
    return response.json({
      materials: materials.map((material) => {
        const { _id, __v, ...record } = material;
        const progress = progressBySlug.get(material.slug);
        return {
          ...record,
          saved_count: savedBySlug.get(material.slug) || 0,
          started_count: progress?.started_count || 0,
          completed_count: progress?.completed_count || 0,
        };
      }),
    });
  });

  app.get('/api/admin/submissions', authenticated, async (request, response) => {
    const forbidden = administrator(request, response);
    if (forbidden) return forbidden;
    const submissions = await models.EditorialSubmission.find().sort({ created_at: -1 }).lean();
    submissions.sort((left, right) => {
      if ((left.status === 'pending') !== (right.status === 'pending')) return left.status === 'pending' ? -1 : 1;
      return new Date(right.created_at) - new Date(left.created_at);
    });
    const userIds = [...new Set(submissions.map((item) => item.user_id))];
    const materialSlugs = [...new Set(submissions.map((item) => item.target_material_slug).filter(Boolean))];
    const [users, materials] = await Promise.all([
      models.User.find({ _id: { $in: userIds } }).select('email').lean(),
      models.Material.find({ slug: { $in: materialSlugs } }).select('slug title').lean(),
    ]);
    const emailsById = new Map(users.map((user) => [user._id, user.email]));
    const titlesBySlug = new Map(materials.map((material) => [material.slug, material.title]));
    return response.json({
      submissions: submissions.map((submission) => {
        const { _id, __v, user_id, target_material_slug, ...record } = submission;
        return {
          id: _id,
          user_id,
          ...record,
          submitter_email: emailsById.get(user_id) || null,
          target_material_slug,
          target_title: titlesBySlug.get(target_material_slug) || null,
        };
      }),
    });
  });

  app.get('/api/admin/submissions/:id/evidence', authenticated, async (request, response, next) => {
    const forbidden = administrator(request, response);
    if (forbidden) return forbidden;
    const submission = await models.EditorialSubmission.findById(request.params.id)
      .select('evidence_storage_name evidence_filename evidence_mime_type');
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

  app.put('/api/admin/submissions/:id/review', authenticated, async (request, response) => {
    const forbidden = administrator(request, response);
    if (forbidden) return forbidden;
    const { decision, reviewNote } = request.body;
    if (!['approve', 'reject'].includes(decision)) {
      return response.status(400).json({ error: 'Choose whether to publish or reject this proposal.' });
    }
    if (typeof reviewNote !== 'string' || reviewNote.trim().length < (decision === 'reject' ? 8 : 0) || reviewNote.length > 2000) {
      return response.status(400).json({ error: decision === 'reject'
        ? 'Explain why this proposal is being rejected (at least 8 characters).'
        : 'The editorial note must be 2,000 characters or fewer.' });
    }

    const submission = await models.EditorialSubmission.findById(request.params.id).lean();
    if (!submission || submission.status !== 'pending') {
      return response.status(409).json({ error: 'This proposal is no longer pending review.' });
    }
    const reviewedAt = new Date();
    if (decision === 'reject') {
      const result = await models.EditorialSubmission.findOneAndUpdate(
        { _id: submission._id, status: 'pending' },
        { $set: { status: 'rejected', review_note: reviewNote.trim(), reviewed_by: request.account.id, reviewed_at: reviewedAt } },
        { new: true },
      );
      if (!result) return response.status(409).json({ error: 'This proposal is no longer pending review.' });
      return response.json({ id: submission._id, status: 'rejected' });
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

    const createsMaterial = submission.request_type === 'new_article' || !submission.target_material_slug;
    let materialSlug = submission.target_material_slug;
    let previousMaterial = null;
    if (createsMaterial) {
      const baseSlug = slugify(finalTitle.trim());
      materialSlug = baseSlug;
      let suffix = 1;
      while (await models.Material.exists({ slug: materialSlug })) {
        suffix += 1;
        materialSlug = `${baseSlug}-${suffix}`;
      }
    } else {
      previousMaterial = await models.Material.findOne({ slug: materialSlug }).lean();
      if (!previousMaterial) {
        return response.status(409).json({ error: 'The article this proposal refers to no longer exists.' });
      }
      if (previousMaterial.record_type === 'central_act') {
        return response.status(409).json({ error: 'Official Act texts are synchronized from India Code and cannot be overwritten by editorial submissions.' });
      }
    }

    const claimed = await models.EditorialSubmission.findOneAndUpdate(
      { _id: submission._id, status: 'pending' },
      {
        $set: {
          status: 'reviewing',
          review_material_slug: materialSlug,
          review_created_material: createsMaterial,
          review_previous_material: previousMaterial,
        },
      },
      { new: true },
    );
    if (!claimed) return response.status(409).json({ error: 'This proposal is no longer pending review.' });

    let materialChanged = false;
    try {
      const finalMaterial = {
        title: finalTitle.trim(),
        category: finalCategory.trim(),
        excerpt: finalExcerpt.trim(),
        body: finalBody.trim(),
        source: finalCitation.trim(),
        source_url: sourceUrl.href,
      };
      if (createsMaterial) {
        await models.Material.create({ slug: materialSlug, ...finalMaterial });
      } else {
        const result = await models.Material.updateOne({ slug: materialSlug }, { $set: finalMaterial });
        if (result.matchedCount !== 1) throw new Error('The article this proposal refers to no longer exists.');
      }
      materialChanged = true;

      const result = await models.EditorialSubmission.updateOne(
        { _id: submission._id, status: 'reviewing' },
        {
          $set: {
            status: 'approved',
            final_title: finalMaterial.title,
            final_category: finalMaterial.category,
            final_excerpt: finalMaterial.excerpt,
            final_body: finalMaterial.body,
            final_citation: finalMaterial.source,
            final_source_url: finalMaterial.source_url,
            published_material_slug: materialSlug,
            review_note: reviewNote.trim(),
            reviewed_by: request.account.id,
            reviewed_at: reviewedAt,
            review_created_material: false,
            review_previous_material: null,
            review_material_slug: null,
          },
        },
      );
      if (result.modifiedCount !== 1) throw new Error('The proposal changed while it was being reviewed.');
    } catch (error) {
      if (materialChanged) {
        if (createsMaterial) {
          await models.Material.deleteOne({ slug: materialSlug });
        } else {
          const { _id, __v, ...previousRecord } = previousMaterial;
          await models.Material.updateOne({ slug: materialSlug }, { $set: previousRecord });
        }
      }
      await models.EditorialSubmission.updateOne(
        { _id: submission._id, status: 'reviewing' },
        {
          $set: { status: 'pending', review_created_material: false, review_previous_material: null, review_material_slug: null },
        },
      );
      throw error;
    }
    return response.json({ id: submission._id, status: 'approved', materialSlug });
  });
};
