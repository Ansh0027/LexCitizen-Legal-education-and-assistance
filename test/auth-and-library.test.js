const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { after, before, test } = require('node:test');

const projectDirectory = path.resolve(__dirname, '..');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'lexcitizen-test-'));
const databasePath = path.join(temporaryDirectory, 'test.sqlite');
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
  port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  processHandle = spawn(process.execPath, ['server.js'], {
    cwd: projectDirectory,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: databasePath,
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
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
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
  assert.deepEqual(await registration.json(), { approvalRequired: true });
  assert.equal(registration.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(`${baseUrl}/server.js`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/data/test.sqlite`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/test.sqlite`)).status, 404);

  const db = new DatabaseSync(databasePath);
  const account = db.prepare('SELECT id, password_hash, role, approval_status, last_login_at FROM users WHERE email = ?').get('learner@example.test');
  assert.equal(account.role, 'user');
  assert.equal(account.approval_status, 'pending');
  assert.equal(account.last_login_at, null);
  assert.notEqual(account.password_hash, 'CitizenPass123!');
  assert.match(account.password_hash, /^\$2[aby]\$/);
  db.close();

  const pendingLogin = await client('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'learner@example.test', password: 'CitizenPass123!', mode: 'user' }),
  });
  assert.equal(pendingLogin.status, 403);
  assert.match((await pendingLogin.json()).error, /awaiting administrator approval/i);

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
  assert.equal(learner.approval_status, 'pending');
  assert.deepEqual(learner.saved_readings, []);
  assert.deepEqual(learner.reading_progress, []);

  const decision = await adminClient(`/api/admin/accounts/${learner.id}/decision`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: 'approve' }),
  });
  assert.equal(decision.status, 200);
  assert.equal((await decision.json()).approval_status, 'approved');

  const userLogin = await client('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'learner@example.test', password: 'CitizenPass123!', mode: 'user' }),
  });
  assert.equal(userLogin.status, 200);
  assert.equal((await client('/api/admin/accounts')).status, 403);

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

  const adminAccountDetails = await adminClient('/api/admin/accounts');
  const approvedLearner = (await adminAccountDetails.json()).accounts.find((item) => item.email === 'learner@example.test');
  assert.equal(approvedLearner.approval_status, 'approved');
  assert.ok(approvedLearner.last_login_at);
  assert.equal(approvedLearner.saved_readings[0].title, 'Article 21: Right to life and personal liberty');
  assert.equal(approvedLearner.reading_progress[0].position_percent, 42);
  const adminMaterials = await adminClient('/api/admin/materials');
  const adminMaterialsData = await adminMaterials.json();
  assert.equal(adminMaterialsData.materials.length, 8);
  const publishedSummary = adminMaterialsData.materials.find((material) => material.slug === 'article-21-right-to-life');
  assert.equal(publishedSummary.saved_count, 1);

  const rejectedRegistration = await client('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'declined@example.test', password: 'CitizenPass456!' }),
  });
  assert.equal(rejectedRegistration.status, 201);
  const accountsBeforeRejection = await adminClient('/api/admin/accounts');
  const declinedAccount = (await accountsBeforeRejection.json()).accounts.find((item) => item.email === 'declined@example.test');
  const rejection = await adminClient(`/api/admin/accounts/${declinedAccount.id}/decision`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: 'reject' }),
  });
  assert.equal(rejection.status, 200);
  const deniedLogin = await client('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'declined@example.test', password: 'CitizenPass456!', mode: 'user' }),
  });
  assert.equal(deniedLogin.status, 403);
  assert.match((await deniedLogin.json()).error, /declined/i);

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
  assert.equal(overviewData.pending_accounts, 0);
  const selfApproval = await client('/api/admin/accounts/not-an-account/decision', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: 'approve' }),
  });
  assert.equal(selfApproval.status, 409);
});
