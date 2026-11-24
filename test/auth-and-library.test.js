const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongoose').mongo;
const { after, before, test } = require('node:test');

const projectDirectory = path.resolve(__dirname, '..');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'lexcitizen-test-'));
const testDatabaseName = `LexCitizen_test_${crypto.randomUUID().replace(/-/g, '')}`;
const mongoUri = `mongodb://127.0.0.1:27017/${testDatabaseName}`;
const adminEmail = 'admin@lexcitizen.test';
const adminPassword = 'AdminPassword!123';
let processHandle;
let baseUrl;
let port;

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const selectedPort = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return selectedPort;
}

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) throw new Error('Test server stopped before it was ready.');
    try {
      const response = await fetch(`${baseUrl}/api/materials`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error('Test server did not start in time.');
}

function makeClient() {
  let cookie = '';
  return async function request(endpoint, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.method && options.method !== 'GET') headers['X-LexCitizen-Request'] = '1';
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(`${baseUrl}${endpoint}`, { ...options, headers });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return response;
  };
}

before(async () => {
  const legacyClient = new MongoClient(mongoUri);
  await legacyClient.connect();
  await legacyClient.db(testDatabaseName).collection('materials').insertOne({
    slug: 'legacy-library-migration',
    title: 'Legacy library migration check',
    category: 'Law and research',
    excerpt: 'A prior reading kept intact during the collection migration.',
    body: 'This reading confirms older library documents are copied into the shared content collection.',
    source: 'Test source',
    source_url: 'https://example.test/legacy',
  });
  await legacyClient.db(testDatabaseName).collection('users').insertOne({
    _id: 'legacy-pending-account',
    email: 'legacy-pending@example.test',
    password_hash: await bcrypt.hash('LegacyCitizen123!', 12),
    role: 'user',
    approval_status: 'pending',
    created_at: new Date(),
    last_login_at: null,
  });
  await legacyClient.close();

  port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  processHandle = spawn(process.execPath, ['src/server.js'], {
    cwd: projectDirectory,
    env: {
      ...process.env,
      PORT: String(port),
      MONGODB_URI: mongoUri,
      EVIDENCE_PATH: temporaryDirectory,
      SESSION_SECRET: 'test-session-secret-is-long-enough-to-run-safely',
      ADMIN_EMAIL: adminEmail,
      ADMIN_PASSWORD: adminPassword,
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForServer();
});

after(async () => {
  if (processHandle && processHandle.exitCode === null) {
    processHandle.kill();
    await new Promise((resolve) => {
      processHandle.once('exit', resolve);
      setTimeout(resolve, 3000);
    });
  }
  const mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  await mongoClient.db(testDatabaseName).dropDatabase();
  await mongoClient.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('legacy materials migrate into content and catalogue responses omit full text', async () => {
  const response = await fetch(`${baseUrl}/api/materials`);
  assert.equal(response.status, 200);
  const { materials } = await response.json();
  assert.equal(materials.length, 9);
  assert.equal(Object.hasOwn(materials[0], 'body'), false);

  const legacy = await (await fetch(`${baseUrl}/api/materials/legacy-library-migration`)).json();
  assert.match(legacy.material.body, /shared content collection/);
  assert.equal(legacy.material.record_type, 'learning_material');

  const mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  const database = mongoClient.db(testDatabaseName);
  assert.equal(await database.collection('content').countDocuments(), 9);
  assert.equal(await database.collection('materials').countDocuments(), 1);
  await mongoClient.close();
});

test('existing pending accounts are unlocked and obsolete approval flags are removed', async () => {
  const mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  const legacyUser = await mongoClient.db(testDatabaseName).collection('users').findOne(
    { email: 'legacy-pending@example.test' },
  );
  assert.equal(legacyUser.approval_status, undefined);
  await mongoClient.close();

  const client = makeClient();
  const login = await client('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'legacy-pending@example.test', password: 'LegacyCitizen123!', mode: 'user' }),
  });
  assert.equal(login.status, 200);
  assert.equal((await client('/api/me/library')).status, 200);
});

test('users register with hashed passwords and persist private reading data', async () => {
  const client = makeClient();
  const blockedMutation = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
  assert.equal(blockedMutation.status, 403);

  const registration = await client('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'learner@example.test', password: 'CitizenPass123!', role: 'admin' }),
  });
  assert.equal(registration.status, 201);
  assert.deepEqual(await registration.json(), { created: true });
  assert.equal(registration.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(`${baseUrl}/server.js`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/src/config/database.js`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/.env.example`)).status, 404);

  const mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  const account = await mongoClient.db(testDatabaseName).collection('users').findOne(
    { email: 'learner@example.test' },
    { projection: { password_hash: 1, role: 1, last_login_at: 1 } },
  );
  assert.equal(account.role, 'user');
  assert.equal(Object.hasOwn(account, 'approval_status'), false);
  assert.equal(account.last_login_at, null);
  assert.notEqual(account.password_hash, 'CitizenPass123!');
  assert.match(account.password_hash, /^\$2[aby]\$/);
  await mongoClient.close();

  const userLogin = await client('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'learner@example.test', password: 'CitizenPass123!', mode: 'user' }),
  });
  assert.equal(userLogin.status, 200);
  assert.equal((await client('/api/me/library')).status, 200);

  const unauthorizedAdminMode = await client('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'learner@example.test', password: 'CitizenPass123!', mode: 'admin' }),
  });
  assert.equal(unauthorizedAdminMode.status, 401);

  const duplicateRegistration = await client('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'learner@example.test', password: 'CitizenPass123!' }),
  });
  assert.equal(duplicateRegistration.status, 409);

  const adminClient = makeClient();
  const adminLogin = await adminClient('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'admin', password: adminPassword, mode: 'admin' }),
  });
  assert.equal(adminLogin.status, 200);
  const pendingAccounts = await adminClient('/api/admin/accounts');
  const learner = (await pendingAccounts.json()).accounts.find((item) => item.email === 'learner@example.test');
  assert.equal(Object.hasOwn(learner, 'approval_status'), false);
  assert.deepEqual(learner.saved_readings, []);
  assert.deepEqual(learner.reading_progress, []);

  const removedApprovalEndpoint = await adminClient(`/api/admin/accounts/${learner.id}/decision`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: 'approve' }),
  });
  assert.equal(removedApprovalEndpoint.status, 404);
  assert.equal((await client('/api/admin/accounts')).status, 403);

  const signedOutClient = makeClient();
  assert.equal((await signedOutClient('/api/me/assessments')).status, 401);
  const assessmentResponse = await client('/api/materials/article-21-right-to-life/assessments');
  assert.equal(assessmentResponse.status, 200);
  const { assessments } = await assessmentResponse.json();
  assert.deepEqual(Object.keys(assessments), ['practice', 'quiz', 'test']);
  assert.equal(assessments.test.questions.length, 3);
  assert.equal(Object.hasOwn(assessments.quiz.questions[0], 'correctChoiceId'), false);

  const practiceAttempt = await client('/api/me/assessments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: 'article-21-right-to-life',
      type: 'practice',
      answers: [{ questionId: 'practice-1', choiceId: 'verify' }],
    }),
  });
  assert.equal(practiceAttempt.status, 201);
  assert.equal((await practiceAttempt.json()).attempt.percentage, 100);

  const invalidAttempt = await client('/api/me/assessments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: 'article-21-right-to-life',
      type: 'quiz',
      answers: [{ questionId: 'quiz-1', choiceId: 'not-a-choice' }],
      score: 100,
    }),
  });
  assert.equal(invalidAttempt.status, 400);

  const quizAttempt = await client('/api/me/assessments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: 'article-21-right-to-life',
      type: 'quiz',
      answers: [{ questionId: 'quiz-1', choiceId: 'choice-0' }],
      score: 100,
    }),
  });
  assert.equal(quizAttempt.status, 201);
  const quizAttemptData = await quizAttempt.json();
  assert.equal(quizAttemptData.attempt.score, 0);
  assert.equal(quizAttemptData.attempt.percentage, 0);
  assert.equal(quizAttemptData.results[0].correctChoiceId, 'choice-1');

  const testAttempt = await client('/api/me/assessments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: 'article-21-right-to-life',
      type: 'test',
      answers: [
        { questionId: 'test-1', choiceId: 'life-liberty' },
        { questionId: 'test-2', choiceId: 'fair-just-reasonable' },
        { questionId: 'test-3', choiceId: 'dignity-privacy-health' },
      ],
    }),
  });
  assert.equal(testAttempt.status, 201);
  assert.equal((await testAttempt.json()).attempt.score, 3);
  const learningResults = await client('/api/me/assessments');
  const learningData = await learningResults.json();
  assert.equal(learningData.performance.attemptCount, 3);
  assert.equal(learningData.performance.overallAccuracy, 80);
  assert.equal(learningData.performance.bestPercentage, 100);
  assert.equal(learningData.attempts.length, 3);
  assert.equal(learningData.hasMore, false);

  const { user: assessmentLearner } = await (await client('/api/auth/me')).json();
  const paginationClient = new MongoClient(mongoUri);
  await paginationClient.connect();
  const attemptCollection = paginationClient.db(testDatabaseName).collection('learning_attempts');
  await attemptCollection.insertMany(Array.from({ length: 48 }, (_, index) => ({
    user_id: assessmentLearner.id,
    material_slug: 'pagination-test',
    assessment_type: 'quiz',
    score: 1,
    max_score: 1,
    percentage: 100,
    answers: [],
    created_at: new Date(Date.now() + index),
  })));
  const firstAttemptPage = await (await client('/api/me/assessments')).json();
  assert.equal(firstAttemptPage.attempts.length, 50);
  assert.equal(firstAttemptPage.hasMore, true);
  const secondAttemptPage = await (await client('/api/me/assessments?offset=50')).json();
  assert.equal(secondAttemptPage.attempts.length, 1);
  assert.equal(secondAttemptPage.hasMore, false);
  await attemptCollection.deleteMany({ user_id: assessmentLearner.id, material_slug: 'pagination-test' });
  await paginationClient.close();

  const proposalForm = new FormData();
  proposalForm.append('requestType', 'correction');
  proposalForm.append('targetMaterialSlug', 'article-21-right-to-life');
  proposalForm.append('title', 'A verified Article 21 update');
  proposalForm.append('category', 'Fundamental rights');
  proposalForm.append('excerpt', 'A verified update explaining an Article 21 judgment.');
  proposalForm.append('proposedBody', 'The user proposal includes more than eighty characters to describe the judgment, its constitutional context, and why the existing explanation should be updated.');
  proposalForm.append('citation', 'Example v. State, Supreme Court of India, 2024 INSC 123');
  proposalForm.append('sourceUrl', 'https://www.sci.gov.in/');
  proposalForm.append('evidence', new Blob(['%PDF-1.7\nverified supporting judgment'], { type: 'application/pdf' }), 'judgment-proof.pdf');
  const proposalResponse = await client('/api/me/submissions', { method: 'POST', body: proposalForm });
  assert.equal(proposalResponse.status, 201);
  const proposal = await proposalResponse.json();
  assert.equal(proposal.status, 'pending');
  assert.equal((await client(`/api/admin/submissions/${proposal.id}/evidence`)).status, 403);
  const beforePublication = await client('/api/materials');
  const beforePublicationData = await beforePublication.json();
  assert.equal(beforePublicationData.materials.find((item) => item.slug === 'article-21-right-to-life').community_updated, 0);

  const invalidProof = new FormData();
  proposalForm.forEach((value, key) => invalidProof.append(key, value));
  invalidProof.set('evidence', new Blob(['not actually a pdf'], { type: 'application/pdf' }), 'fake.pdf');
  const invalidProofResponse = await client('/api/me/submissions', { method: 'POST', body: invalidProof });
  assert.equal(invalidProofResponse.status, 400);

  const adminSubmissions = await adminClient('/api/admin/submissions');
  const adminProposal = (await adminSubmissions.json()).submissions.find((item) => item.id === proposal.id);
  assert.equal(adminProposal.submitter_email, 'learner@example.test');
  assert.equal(adminProposal.status, 'pending');
  const proofDownload = await adminClient(`/api/admin/submissions/${proposal.id}/evidence`);
  assert.equal(proofDownload.status, 200);
  assert.match(proofDownload.headers.get('content-disposition'), /attachment/);
  assert.match(await proofDownload.text(), /^%PDF-1\.7/);

  const missingEditorialCopy = await adminClient(`/api/admin/submissions/${proposal.id}/review`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: 'approve' }),
  });
  assert.equal(missingEditorialCopy.status, 400);

  const publication = await adminClient(`/api/admin/submissions/${proposal.id}/review`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      decision: 'approve',
      finalTitle: 'Article 21: Right to life and personal liberty',
      finalCategory: 'Fundamental rights',
      finalExcerpt: 'Administrator-verified Article 21 explainer with a reviewed source.',
      finalBody: 'This administrator-edited and verified article text describes the constitutional protection in Article 21, its proper context, and why the cited judicial authority matters to readers.',
      finalCitation: 'Verified official judgment, Supreme Court of India, 2024 INSC 123',
      finalSourceUrl: 'https://www.sci.gov.in/',
      reviewNote: 'Official court source checked and public wording edited.',
    }),
  });
  assert.equal(publication.status, 200);
  assert.equal((await publication.json()).status, 'approved');
  const guestClient = makeClient();
  const publicUpdates = await guestClient('/api/materials');
  const publicUpdateData = await publicUpdates.json();
  assert.equal(publicUpdateData.materials.find((item) => item.slug === 'article-21-right-to-life').community_updated, 1);
  const publicMaterial = await guestClient('/api/materials/article-21-right-to-life');
  const publishedMaterial = (await publicMaterial.json()).material;
  assert.match(publishedMaterial.body, /administrator-edited and verified/i);
  assert.equal(publishedMaterial.source, 'Verified official judgment, Supreme Court of India, 2024 INSC 123');

  const ownSubmissions = await client('/api/me/submissions');
  assert.equal((await ownSubmissions.json()).submissions[0].status, 'approved');

  const migrationClient = new MongoClient(mongoUri);
  await migrationClient.connect();
  await migrationClient.db(testDatabaseName).collection('content').insertOne({
    slug: 'test-central-act',
    title: 'Test Central Act, 2024',
    category: 'Central Acts',
    excerpt: 'A source-managed Central Act used to verify editorial protection.',
    body: 'Original official text that must not be overwritten.',
    source: 'Act No. 1 of 2024',
    source_url: 'https://indiacode.gov.in/handle/123456789/1',
    record_type: 'central_act',
    source_provider: 'india-code',
    source_item_id: 'test-central-act-uuid',
    official_text_available: true,
    content_completeness: 'full_text',
  });
  await migrationClient.close();

  const centralActCorrection = new FormData();
  centralActCorrection.append('requestType', 'correction');
  centralActCorrection.append('targetMaterialSlug', 'test-central-act');
  centralActCorrection.append('title', 'Proposed official Act correction');
  centralActCorrection.append('category', 'Everyday laws');
  centralActCorrection.append('excerpt', 'A proposed change to an official Act transcription for testing.');
  centralActCorrection.append('proposedBody', 'The proposed replacement is long enough to pass validation but must never replace text maintained by the official India Code source.');
  centralActCorrection.append('citation', 'Test citation, official source, section 1');
  centralActCorrection.append('sourceUrl', 'https://indiacode.gov.in/handle/123456789/1');
  const protectedProposalResponse = await client('/api/me/submissions', { method: 'POST', body: centralActCorrection });
  assert.equal(protectedProposalResponse.status, 201);
  const protectedProposal = await protectedProposalResponse.json();
  const protectedReview = await adminClient(`/api/admin/submissions/${protectedProposal.id}/review`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      decision: 'approve',
      finalTitle: 'Proposed official Act correction',
      finalCategory: 'Everyday laws',
      finalExcerpt: 'A proposed change to an official Act transcription for testing.',
      finalBody: 'The proposed replacement is long enough to pass validation but must never replace text maintained by the official India Code source.',
      finalCitation: 'Test citation, official source, section 1',
      finalSourceUrl: 'https://indiacode.gov.in/handle/123456789/1',
      reviewNote: 'Test official source protection.',
    }),
  });
  assert.equal(protectedReview.status, 409);
  const protectedAct = await (await fetch(`${baseUrl}/api/materials/test-central-act`)).json();
  assert.equal(protectedAct.material.body, 'Original official text that must not be overwritten.');

  const save = await client('/api/me/saved/article-21-right-to-life', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ saved: true }),
  });
  assert.equal(save.status, 200);

  const invalidProgress = await client('/api/me/progress/article-21-right-to-life', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ positionPercent: 101 }),
  });
  assert.equal(invalidProgress.status, 400);

  const progress = await client('/api/me/progress/article-21-right-to-life', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ positionPercent: 42 }),
  });
  assert.equal(progress.status, 200);

  const library = await client('/api/me/library');
  const libraryData = await library.json();
  assert.equal(libraryData.saved[0].slug, 'article-21-right-to-life');
  assert.equal(libraryData.progress[0].position_percent, 42);

  const logout = await client('/api/auth/logout', { method: 'POST' });
  assert.equal(logout.status, 204);
  assert.equal((await client('/api/me/library')).status, 401);
  assert.equal((await client('/api/me/assessments')).status, 401);

  const reLogin = await client('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'learner@example.test', password: 'CitizenPass123!', mode: 'user' }),
  });
  assert.equal(reLogin.status, 200);
  assert.equal((await client('/api/admin/overview')).status, 403);
  const restoredLibrary = await client('/api/me/library');
  const restoredData = await restoredLibrary.json();
  assert.equal(restoredData.saved[0].slug, 'article-21-right-to-life');
  assert.equal(restoredData.progress[0].position_percent, 42);
  assert.equal((await client('/api/me/assessments')).status, 200);
  const restoredLearning = await (await client('/api/me/assessments')).json();
  assert.equal(restoredLearning.performance.attemptCount, 3);
  const attemptMongoClient = new MongoClient(mongoUri);
  await attemptMongoClient.connect();
  assert.equal(await attemptMongoClient.db(testDatabaseName).collection('learning_attempts').countDocuments({
    material_slug: 'article-21-right-to-life',
  }), 3);
  await attemptMongoClient.close();

  const adminAccountDetails = await adminClient('/api/admin/accounts');
  const approvedLearner = (await adminAccountDetails.json()).accounts.find((item) => item.email === 'learner@example.test');
  assert.equal(Object.hasOwn(approvedLearner, 'approval_status'), false);
  assert.ok(approvedLearner.last_login_at);
  assert.equal(approvedLearner.saved_readings[0].title, 'Article 21: Right to life and personal liberty');
  assert.equal(approvedLearner.reading_progress[0].position_percent, 42);
  const adminMaterials = await adminClient('/api/admin/materials');
  const adminMaterialsData = await adminMaterials.json();
  assert.equal(adminMaterialsData.materials.length, 10);
  const publishedSummary = adminMaterialsData.materials.find((material) => material.slug === 'article-21-right-to-life');
  assert.equal(publishedSummary.saved_count, 1);

  const selfServiceClient = makeClient();
  const selfServiceRegistration = await selfServiceClient('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'declined@example.test', password: 'CitizenPass456!' }),
  });
  assert.equal(selfServiceRegistration.status, 201);
  assert.deepEqual(await selfServiceRegistration.json(), { created: true });
  const directLogin = await selfServiceClient('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'declined@example.test', password: 'CitizenPass456!', mode: 'user' }),
  });
  assert.equal(directLogin.status, 200);
  assert.equal((await selfServiceClient('/api/me/library')).status, 200);

  const denialRequest = new FormData();
  for (const [key, value] of proposalForm.entries()) {
    if (key !== 'evidence') denialRequest.append(key, value);
  }
  denialRequest.set('requestType', 'judicial_update');
  denialRequest.delete('targetMaterialSlug');
  denialRequest.set('title', 'A judicial update that needs stronger proof');
  const deniedProposal = await client('/api/me/submissions', { method: 'POST', body: denialRequest });
  assert.equal(deniedProposal.status, 201);
  const deniedProposalId = (await deniedProposal.json()).id;
  const deniedDecision = await adminClient(`/api/admin/submissions/${deniedProposalId}/review`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: 'reject', reviewNote: 'The submitted source does not verify the legal proposition.' }),
  });
  assert.equal(deniedDecision.status, 200);
  assert.equal((await client('/api/me/submissions')).status, 200);
  assert.match((await (await client('/api/me/submissions')).json()).submissions[0].review_note, /does not verify/i);

  const newArticleForm = new FormData();
  for (const [key, value] of proposalForm.entries()) {
    if (key !== 'evidence' && key !== 'targetMaterialSlug') newArticleForm.append(key, value);
  }
  newArticleForm.set('requestType', 'new_article');
  newArticleForm.set('title', 'An original legal education proposal');
  const newArticleResponse = await client('/api/me/submissions', { method: 'POST', body: newArticleForm });
  assert.equal(newArticleResponse.status, 201);
  const newArticleSubmission = await newArticleResponse.json();
  const newArticlePublication = await adminClient(`/api/admin/submissions/${newArticleSubmission.id}/review`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      decision: 'approve',
      finalTitle: 'A newly verified legal explainer',
      finalCategory: 'Fundamental rights',
      finalExcerpt: 'An administrator-reviewed new explainer with clear constitutional context.',
      finalBody: 'This new administrator-reviewed explainer presents the legal issue, its constitutional context, and the primary legal source in clear language suitable for readers learning about the law.',
      finalCitation: 'Reviewed source: Constitution of India',
      finalSourceUrl: 'https://www.indiacode.nic.in/',
      reviewNote: 'The source was checked and the final text edited.',
    }),
  });
  assert.equal(newArticlePublication.status, 200);
  const publishedNewArticle = await newArticlePublication.json();
  assert.match(publishedNewArticle.materialSlug, /^a-newly-verified-legal-explainer/);
  const publicNewArticle = await guestClient('/api/materials');
  const publicNewArticleData = await publicNewArticle.json();
  assert.equal(publicNewArticleData.materials.find((item) => item.slug === publishedNewArticle.materialSlug).community_updated, 1);
});

test('admin account role is checked by the server', async () => {
  const client = makeClient();
  const login = await client('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'admin', password: adminPassword, mode: 'admin' }),
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).user.role, 'admin');
  const overview = await client('/api/admin/overview');
  assert.equal(overview.status, 200);
  const overviewData = (await overview.json()).overview;
  assert.ok(overviewData.accounts >= 2);
  assert.equal(Object.hasOwn(overviewData, 'pending_accounts'), false);
  const removedApprovalEndpoint = await client('/api/admin/accounts/not-an-account/decision', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: 'approve' }),
  });
  assert.equal(removedApprovalEndpoint.status, 404);
});

test('EJS pages render through Express and public assets remain available', async () => {
  const pages = [
    '/', '/index.html', '/signin.html', '/reader.html', '/books.html',
    '/admin-dashboard.html', '/user-dashboard.html', '/amendments.html',
    '/everyday-laws.html', '/fundamental-duties.html', '/fundamental-rights.html',
    '/key-articles.html', '/origin-structure.html',
  ];

  for (const page of pages) {
    const response = await fetch(`${baseUrl}${page}`);
    assert.equal(response.status, 200, `${page} should render`);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(await response.text(), /<!doctype html>/i);
  }

  const readerMarkup = await (await fetch(`${baseUrl}/reader.html`)).text();
  assert.match(readerMarkup, /id="readerIdeaGrid"/);
  assert.match(readerMarkup, /id="readerAssessmentStages"/);
  assert.match(readerMarkup, /Practice, quiz &amp; test/);
  assert.match(readerMarkup, /id="readerTextLarger"/);
  const dashboardMarkup = await (await fetch(`${baseUrl}/user-dashboard.html`)).text();
  assert.match(dashboardMarkup, /id="assessmentHistory"/);
  assert.match(dashboardMarkup, /id="assessmentAccuracy"/);
  assert.equal((await fetch(`${baseUrl}/css/styles.css`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/css/learning.css`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/js/app.js`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/js/reader.js`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/js/library.js`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/ipc-sections.json`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/src/views/pages/index.ejs`)).status, 404);
});
