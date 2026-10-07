const adminMessage = document.querySelector('#adminMessage');

if (adminMessage) {
  let accountRows = [];

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(options.method && options.method !== 'GET' ? { 'X-LexCitizen-Request': '1' } : {}),
      },
    });
    if (response.status === 204) return {};
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
    return result;
  }

  function showAdminMessage(text, type = 'error') {
    adminMessage.textContent = text;
    adminMessage.className = `library-message ${type}`;
    adminMessage.hidden = false;
  }

  function formatDate(value) {
    if (!value) return 'Never';
    const date = new Date(`${value.replace(' ', 'T')}Z`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  function makeElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function makeActivityList(title, readings, getDescription) {
    const section = makeElement('div', 'account-activity');
    section.append(makeElement('h4', '', `${title} (${readings.length})`));
    if (readings.length === 0) {
      section.append(makeElement('p', 'admin-activity-empty', 'No reading activity yet.'));
      return section;
    }
    const list = makeElement('ul', 'admin-reading-list');
    readings.forEach((reading) => {
      const item = makeElement('li');
      item.append(makeElement('strong', '', reading.title));
      item.append(makeElement('span', '', getDescription(reading)));
      list.append(item);
    });
    section.append(list);
    return section;
  }

  function makeAccountCard(account) {
    const card = makeElement('article', 'admin-account-card');
    const heading = makeElement('div', 'admin-account-heading');
    const identity = makeElement('div');
    identity.append(makeElement('h3', '', account.email));
    identity.append(makeElement('p', 'admin-account-meta', `Joined ${formatDate(account.created_at)} · Last login ${formatDate(account.last_login_at)}`));
    const status = makeElement('span', `admin-status ${account.approval_status}`, account.role === 'admin' ? 'Administrator' : account.approval_status);
    heading.append(identity, status);
    card.append(heading);

    if (account.role === 'admin') {
      card.append(makeElement('p', 'admin-activity-empty', 'Administrator account.'));
      return card;
    }

    const activity = makeElement('div', 'admin-account-activity');
    activity.append(makeActivityList('Saved readings', account.saved_readings, (reading) => `${reading.category} · saved ${formatDate(reading.created_at)}`));
    activity.append(makeActivityList('Reading progress', account.reading_progress, (reading) => `${reading.category} · ${reading.position_percent}% read · updated ${formatDate(reading.updated_at)}`));
    card.append(activity);

    if (account.approval_status === 'pending') {
      card.append(makeDecisionButtons(account.id));
    }
    return card;
  }

  function makeDecisionButtons(accountId) {
    const actions = makeElement('div', 'admin-request-actions');
    const approve = makeElement('button', 'admin-decision approve', 'Approve account');
    approve.type = 'button';
    approve.addEventListener('click', () => decideRequest(accountId, 'approve', approve));
    const reject = makeElement('button', 'admin-decision reject', 'Deny request');
    reject.type = 'button';
    reject.addEventListener('click', () => decideRequest(accountId, 'reject', reject));
    actions.append(approve, reject);
    return actions;
  }

  function renderAccounts() {
    const pending = accountRows.filter((account) => account.role === 'user' && account.approval_status === 'pending');
    document.querySelector('#pendingCount').textContent = `${pending.length} pending`;
    document.querySelector('#accountCount').textContent = `${accountRows.length} accounts`;
    document.querySelector('#pendingAccounts').replaceChildren(...pending.map(makeAccountCard));
    document.querySelector('#noPendingAccounts').hidden = pending.length > 0;
    document.querySelector('#accountList').replaceChildren(...accountRows.map(makeAccountCard));
  }

  function renderMaterials(materials) {
    const container = document.querySelector('#adminMaterials');
    document.querySelector('#adminMaterialCount').textContent = `${materials.length} materials`;
    container.replaceChildren(...materials.map((material) => {
      const card = makeElement('details', 'admin-material-card');
      const summary = makeElement('summary');
      const title = makeElement('span', 'admin-material-title');
      title.append(makeElement('strong', '', material.title));
      title.append(makeElement('small', '', `${material.category} · ${material.saved_count} saved · ${material.started_count} started · ${material.completed_count} completed`));
      summary.append(title);
      card.append(summary);
      card.append(makeElement('p', '', material.excerpt));
      card.append(makeElement('p', 'admin-material-source', `Source: ${material.source}`));
      material.body.split(/\n\n+/).forEach((paragraph) => card.append(makeElement('p', '', paragraph)));
      return card;
    }));
  }

  function addReviewField(form, id, labelText, value, options = {}) {
    const wrapper = makeElement('div', `editorial-field${options.full ? ' full' : ''}`);
    const label = makeElement('label', '', labelText);
    label.htmlFor = id;
    const input = options.multiline ? makeElement('textarea') : makeElement('input');
    input.id = id;
    input.required = true;
    input.value = value || '';
    if (options.multiline) {
      input.rows = options.rows || 3;
      input.maxLength = options.maxLength;
    } else {
      input.type = options.type || 'text';
      input.maxLength = options.maxLength;
    }
    wrapper.append(label, input);
    form.append(wrapper);
    return input;
  }

  function makeReviewCard(submission) {
    const card = makeElement('article', 'editorial-review-card');
    const header = makeElement('div', 'editorial-review-header');
    const heading = makeElement('div');
    const typeLabel = submission.request_type === 'correction'
      ? 'Article correction'
      : submission.request_type === 'judicial_update' ? 'Judicial decision update' : 'New legal article';
    heading.append(makeElement('p', 'section-eyebrow', typeLabel));
    heading.append(makeElement('h3', '', submission.proposed_title));
    heading.append(makeElement('p', 'admin-account-meta', `Submitted by ${submission.submitter_email} · ${formatDate(submission.created_at)}`));
    const status = makeElement('span', `submission-status ${submission.status}`, submission.status);
    header.append(heading, status);
    card.append(header);

    if (submission.target_title) {
      card.append(makeElement('p', 'editorial-target', `Suggested reading to update: ${submission.target_title}`));
    }
    const evidence = makeElement('div', 'editorial-evidence');
    evidence.append(makeElement('strong', '', 'Contributor’s proposed information'));
    evidence.append(makeElement('p', '', submission.proposed_excerpt));
    const proposedBody = makeElement('div', 'editorial-proposed-body');
    submission.proposed_body.split(/\n\n+/).forEach((paragraph) => proposedBody.append(makeElement('p', '', paragraph)));
    evidence.append(proposedBody);
    evidence.append(makeElement('p', 'editorial-citation', `Citation: ${submission.citation}`));
    const sourceLink = makeElement('a', '', 'Open submitted source ↗');
    sourceLink.href = submission.source_url;
    sourceLink.target = '_blank';
    sourceLink.rel = 'noopener noreferrer';
    evidence.append(sourceLink);
    if (submission.evidence_filename) {
      const proofLink = makeElement('a', 'evidence-download', `Download supporting proof: ${submission.evidence_filename}`);
      proofLink.href = `/api/admin/submissions/${encodeURIComponent(submission.id)}/evidence`;
      proofLink.setAttribute('download', '');
      evidence.append(proofLink);
    }
    card.append(evidence);

    if (submission.status !== 'pending') {
      const finalState = makeElement('p', 'editorial-result', submission.status === 'approved'
        ? `Published to the public reading library as “${submission.final_title}”.`
        : `Denied: ${submission.review_note}`);
      card.append(finalState);
      return card;
    }

    const form = makeElement('form', 'editorial-review-form');
    const headingRow = makeElement('div', 'editorial-final-heading');
    headingRow.append(makeElement('p', 'section-eyebrow', 'Administrator’s final public version'));
    headingRow.append(makeElement('p', 'editorial-edit-note', 'Edit and verify the final text below before publishing.'));
    form.append(headingRow);
    const finalTitle = addReviewField(form, `finalTitle-${submission.id}`, 'Final public title', submission.proposed_title, { maxLength: 180 });

    const categoryWrapper = makeElement('div', 'editorial-field');
    const categoryLabel = makeElement('label', '', 'Final topic');
    const categoryId = `finalCategory-${submission.id}`;
    categoryLabel.htmlFor = categoryId;
    const finalCategory = makeElement('select');
    finalCategory.id = categoryId;
    finalCategory.required = true;
    [...new Set(['Fundamental rights', 'Fundamental duties', 'Constitutional amendments', 'Constitutional theory', 'Everyday laws', 'Law and research', 'Judicial decisions'])].forEach((category) => {
      const option = makeElement('option', '', category);
      option.value = category;
      finalCategory.append(option);
    });
    finalCategory.value = submission.proposed_category;
    categoryWrapper.append(categoryLabel, finalCategory);
    form.append(categoryWrapper);

    const finalExcerpt = addReviewField(form, `finalExcerpt-${submission.id}`, 'Final summary', submission.proposed_excerpt, { multiline: true, rows: 2, maxLength: 400, full: true });
    const finalBody = addReviewField(form, `finalBody-${submission.id}`, 'Final article text', submission.proposed_body, { multiline: true, rows: 7, maxLength: 20000, full: true });
    const finalCitation = addReviewField(form, `finalCitation-${submission.id}`, 'Verified final citation', submission.citation, { maxLength: 1000, full: true });
    const finalSourceUrl = addReviewField(form, `finalSourceUrl-${submission.id}`, 'Verified official source URL', submission.source_url, { type: 'url', maxLength: 2048, full: true });
    const reviewNote = addReviewField(form, `reviewNote-${submission.id}`, 'Private editorial note (required when denying)', '', { multiline: true, rows: 2, maxLength: 2000, full: true });
    const actions = makeElement('div', 'admin-request-actions');
    const approve = makeElement('button', 'admin-decision approve', 'Approve and publish final version');
    approve.type = 'submit';
    approve.value = 'approve';
    const deny = makeElement('button', 'admin-decision reject', 'Deny proposal');
    deny.type = 'button';
    deny.addEventListener('click', () => submitReview(submission.id, 'reject', {
      reviewNote: reviewNote.value,
    }, deny));
    actions.append(approve, deny);
    form.append(actions);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitReview(submission.id, 'approve', {
        finalTitle: finalTitle.value,
        finalCategory: finalCategory.value,
        finalExcerpt: finalExcerpt.value,
        finalBody: finalBody.value,
        finalCitation: finalCitation.value,
        finalSourceUrl: finalSourceUrl.value,
        reviewNote: reviewNote.value,
      }, approve);
    });
    card.append(form);
    return card;
  }

  function renderSubmissions(submissions) {
    const pendingCount = submissions.filter((submission) => submission.status === 'pending').length;
    document.querySelector('#editorialQueueCount').textContent = `${pendingCount} pending · ${submissions.length} total`;
    const container = document.querySelector('#editorialQueue');
    container.replaceChildren(...submissions.map(makeReviewCard));
    document.querySelector('#noEditorialSubmissions').hidden = submissions.length > 0;
  }

  async function submitReview(submissionId, decision, fields, button) {
    if (decision === 'reject' && fields.reviewNote.trim().length < 8) {
      showAdminMessage('Please explain the reason for denying this proposal (at least 8 characters).');
      return;
    }
    const card = button.closest('.editorial-review-card');
    card.querySelectorAll('button').forEach((item) => { item.disabled = true; });
    try {
      await apiRequest(`/api/admin/submissions/${encodeURIComponent(submissionId)}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, decision }),
      });
      showAdminMessage(decision === 'approve'
        ? 'Verified final version published to the public LexCitizen reading library.'
        : 'Proposal denied. Your editorial reason has been recorded for the contributor.', 'success');
      await refreshAdminData();
    } catch (error) {
      card.querySelectorAll('button').forEach((item) => { item.disabled = false; });
      showAdminMessage(error.message);
    }
  }

  async function decideRequest(accountId, decision, clickedButton) {
    const buttons = clickedButton.parentElement.querySelectorAll('button');
    buttons.forEach((button) => { button.disabled = true; });
    try {
      await apiRequest(`/api/admin/accounts/${encodeURIComponent(accountId)}/decision`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      showAdminMessage(decision === 'approve' ? 'Account request approved. The user can now sign in.' : 'Account request denied.', 'success');
      await refreshAdminData();
    } catch (error) {
      buttons.forEach((button) => { button.disabled = false; });
      showAdminMessage(error.message);
    }
  }

  async function refreshAdminData() {
    const [overviewResponse, accountsResponse, materialsResponse, submissionsResponse] = await Promise.all([
      apiRequest('/api/admin/overview'),
      apiRequest('/api/admin/accounts'),
      apiRequest('/api/admin/materials'),
      apiRequest('/api/admin/submissions'),
    ]);
    accountRows = accountsResponse.accounts;
    const overviewElement = document.querySelector('#adminOverview');
    overviewElement.replaceChildren();
    [
      ['Accounts', overviewResponse.overview.accounts],
      ['Pending approvals', overviewResponse.overview.pending_accounts],
      ['Reading materials', overviewResponse.overview.materials],
      ['Saved readings', overviewResponse.overview.saved_readings],
      ['Legal proposals', overviewResponse.overview.pending_proposals],
    ].forEach(([label, value]) => {
      const card = makeElement('div', 'admin-stat');
      card.append(makeElement('strong', '', String(value)));
      card.append(makeElement('span', '', label));
      overviewElement.append(card);
    });
    overviewElement.hidden = false;
    renderAccounts();
    renderMaterials(materialsResponse.materials);
    renderSubmissions(submissionsResponse.submissions);
  }

  async function startAdminPortal() {
    try {
      const { user } = await apiRequest('/api/auth/me');
      if (user.role !== 'admin') {
        window.location.replace('user-dashboard.html');
        return;
      }
      document.querySelector('#adminGreeting').textContent = `Signed in as ${user.email}. This account has administrator access.`;
      await refreshAdminData();
    } catch (error) {
      if (error.message === 'Not signed in.') {
        window.location.replace('signin.html');
        return;
      }
      showAdminMessage(error.message);
    }
  }

  document.querySelector('#adminLogout').addEventListener('click', async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
      window.location.replace('signin.html');
    } catch (error) {
      showAdminMessage(error.message);
    }
  });

  startAdminPortal();
}
