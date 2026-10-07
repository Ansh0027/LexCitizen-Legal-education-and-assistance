const libraryMessage = document.querySelector('#libraryMessage');

if (libraryMessage) {
  const savedReadings = document.querySelector('#savedReadings');
  const allReadings = document.querySelector('#allReadings');
  const continueReading = document.querySelector('#continueReading');
  const savedEmpty = document.querySelector('#savedEmpty');
  const librarySearch = document.querySelector('#librarySearch');
  const filtersElement = document.querySelector('#libraryFilters');
  const contributionForm = document.querySelector('#contributionForm');
  const contributionMessage = document.querySelector('#contributionMessage');
  const requestType = document.querySelector('#requestType');
  const targetMaterial = document.querySelector('#targetMaterial');
  const categories = ['All topics'];
  let materials = [];
  let library = { saved: [], progress: [] };
  let selectedCategory = 'All topics';

  function showLibraryMessage(message, type = 'error') {
    libraryMessage.textContent = message;
    libraryMessage.className = `library-message ${type}`;
    libraryMessage.hidden = false;
  }

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

  function progressFor(slug) {
    return library.progress.find((item) => item.slug === slug)?.position_percent || 0;
  }

  function isSaved(slug) {
    return library.saved.some((item) => item.slug === slug);
  }

  function makeReadingCard(material, showBookmark = true) {
    const card = document.createElement('article');
    card.className = 'library-card';

    const category = document.createElement('p');
    category.className = 'section-eyebrow';
    category.textContent = material.category;

    const title = document.createElement('h3');
    title.textContent = material.title;

    const excerpt = document.createElement('p');
    excerpt.className = 'library-excerpt';
    excerpt.textContent = material.excerpt;

    const progress = progressFor(material.slug);
    const progressText = document.createElement('p');
    progressText.className = 'library-progress-text';
    progressText.textContent = progress > 0 ? `${progress}% read` : 'Not started';

    const progressTrack = document.createElement('div');
    progressTrack.className = 'library-progress-track';
    progressTrack.setAttribute('role', 'progressbar');
    progressTrack.setAttribute('aria-label', `Reading progress for ${material.title}`);
    progressTrack.setAttribute('aria-valuemin', '0');
    progressTrack.setAttribute('aria-valuemax', '100');
    progressTrack.setAttribute('aria-valuenow', String(progress));
    const progressBar = document.createElement('span');
    progressBar.style.width = `${progress}%`;
    progressTrack.append(progressBar);

    const actions = document.createElement('div');
    actions.className = 'library-card-actions';
    const readLink = document.createElement('a');
    readLink.className = 'solid-button';
    readLink.href = `reader.html?slug=${encodeURIComponent(material.slug)}`;
    readLink.textContent = progress > 0 && progress < 100 ? 'Continue reading' : progress === 100 ? 'Read again' : 'Read article';
    actions.append(readLink);

    if (showBookmark) {
      const saveButton = document.createElement('button');
      saveButton.className = 'library-save-button';
      saveButton.type = 'button';
      saveButton.textContent = isSaved(material.slug) ? 'Remove saved' : 'Save reading';
      saveButton.setAttribute('aria-pressed', String(isSaved(material.slug)));
      saveButton.addEventListener('click', () => toggleSaved(material.slug));
      actions.append(saveButton);
    }

    card.append(category, title, excerpt, progressText, progressTrack, actions);
    return card;
  }

  async function toggleSaved(slug) {
    try {
      const saved = !isSaved(slug);
      await apiRequest(`/api/me/saved/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saved }),
      });
      library.saved = saved
        ? [{ slug, created_at: new Date().toISOString() }, ...library.saved]
        : library.saved.filter((item) => item.slug !== slug);
      render();
    } catch (error) {
      showLibraryMessage(error.message);
    }
  }

  function renderFilters() {
    filtersElement.replaceChildren();
    const allCategories = [...categories, ...new Set(materials.map((item) => item.category))];
    allCategories.forEach((categoryName) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `library-filter${selectedCategory === categoryName ? ' active' : ''}`;
      button.textContent = categoryName;
      button.setAttribute('aria-pressed', String(selectedCategory === categoryName));
      button.addEventListener('click', () => {
        selectedCategory = categoryName;
        renderFilters();
        renderAll();
      });
      filtersElement.append(button);
    });
  }

  function renderAll() {
    const query = librarySearch.value.trim().toLowerCase();
    const visible = materials.filter((material) => {
      const matchesCategory = selectedCategory === 'All topics' || material.category === selectedCategory;
      const matchesQuery = !query || `${material.title} ${material.category} ${material.excerpt}`.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
    document.querySelector('#materialCount').textContent = `${visible.length} ${visible.length === 1 ? 'reading' : 'readings'}`;
    allReadings.replaceChildren(...visible.map((material) => makeReadingCard(material)));
    if (visible.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'library-empty';
      empty.textContent = 'No readings match that search.';
      allReadings.append(empty);
    }
  }

  function render() {
    const bySlug = new Map(materials.map((item) => [item.slug, item]));
    const savedMaterials = library.saved.map((item) => bySlug.get(item.slug)).filter(Boolean);
    document.querySelector('#savedCount').textContent = `${savedMaterials.length} saved`;
    savedReadings.replaceChildren(...savedMaterials.map((material) => makeReadingCard(material)));
    savedEmpty.hidden = savedMaterials.length > 0;

    const latestProgress = library.progress.find((item) => item.position_percent > 0 && item.position_percent < 100);
    const latestMaterial = latestProgress ? bySlug.get(latestProgress.slug) : null;
    if (latestMaterial) {
      continueReading.replaceChildren(makeReadingCard(latestMaterial, false));
    } else {
      const message = document.createElement('p');
      message.textContent = 'Your reading progress will appear here after you start an article.';
      continueReading.replaceChildren(message);
    }
    renderAll();
  }

  function showContributionMessage(text, type = 'error') {
    contributionMessage.textContent = text;
    contributionMessage.className = `contribution-message ${type}`;
    contributionMessage.hidden = false;
  }

  function renderTargetOptions(selectedSlug = '') {
    targetMaterial.replaceChildren();
    const prompt = document.createElement('option');
    prompt.value = '';
    prompt.textContent = 'Choose an existing reading (optional for new articles)';
    targetMaterial.append(prompt);
    materials.forEach((material) => {
      const option = document.createElement('option');
      option.value = material.slug;
      option.textContent = `${material.title} · ${material.category}`;
      targetMaterial.append(option);
    });
    targetMaterial.value = selectedSlug;
  }

  function updateContributionType() {
    const isCorrection = requestType.value === 'correction';
    document.querySelector('#targetMaterialField').hidden = requestType.value === 'new_article';
    targetMaterial.required = isCorrection;
    if (requestType.value === 'judicial_update') {
      document.querySelector('#proposalCategory').value = 'Judicial decisions';
    }
    contributionMessage.hidden = true;
  }

  function renderSubmissions(submissions) {
    const container = document.querySelector('#mySubmissions');
    const empty = document.querySelector('#noSubmissions');
    container.replaceChildren(...submissions.map((submission) => {
      const card = document.createElement('article');
      card.className = 'my-submission-card';
      const heading = document.createElement('div');
      heading.className = 'my-submission-heading';
      const title = document.createElement('h3');
      title.textContent = submission.proposed_title;
      const status = document.createElement('span');
      status.className = `submission-status ${submission.status}`;
      status.textContent = submission.status;
      heading.append(title, status);
      card.append(heading);

      const requestLabel = submission.request_type === 'correction'
        ? 'Article correction'
        : submission.request_type === 'judicial_update' ? 'Judicial update' : 'New article';
      const context = document.createElement('p');
      context.className = 'my-submission-meta';
      context.textContent = `${requestLabel} · ${submission.target_title || submission.proposed_category} · submitted ${new Date(`${submission.created_at.replace(' ', 'T')}Z`).toLocaleString()}`;
      card.append(context);
      if (submission.review_note) {
        const decision = document.createElement('p');
        decision.className = 'submission-review-note';
        decision.textContent = `Editorial note: ${submission.review_note}`;
        card.append(decision);
      }
      if (submission.status === 'approved' && submission.final_title) {
        const published = document.createElement('p');
        published.className = 'submission-review-note';
        published.textContent = `Published as: ${submission.final_title}`;
        card.append(published);
      }
      return card;
    }));
    empty.hidden = submissions.length > 0;
  }

  contributionForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = document.querySelector('#submitContribution');
    submitButton.disabled = true;
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Sending proposal…';
    try {
      const response = await fetch('/api/me/submissions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-LexCitizen-Request': '1' },
        body: new FormData(contributionForm),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The proposal could not be sent.');
      contributionForm.reset();
      renderTargetOptions();
      updateContributionType();
      showContributionMessage('Your proposal and proof were submitted for administrator review. Nothing will appear on the public site until an editor approves and publishes it.', 'success');
      const { submissions } = await apiRequest('/api/me/submissions');
      renderSubmissions(submissions);
    } catch (error) {
      showContributionMessage(error.message);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  });

  requestType.addEventListener('change', updateContributionType);

  async function start() {
    try {
      const { user } = await apiRequest('/api/auth/me');
      document.querySelector('#accountGreeting').textContent = `Signed in as ${user.email}. Your reading list belongs to your account.`;
      const [materialResponse, libraryResponse, submissionResponse] = await Promise.all([
        apiRequest('/api/materials'),
        apiRequest('/api/me/library'),
        apiRequest('/api/me/submissions'),
      ]);
      materials = materialResponse.materials;
      library = libraryResponse;
      renderTargetOptions();
      updateContributionType();
      renderFilters();
      render();
      renderSubmissions(submissionResponse.submissions);
    } catch (error) {
      if (error.message === 'Not signed in.' || error.message === 'Please sign in to continue.') {
        window.location.replace('signin.html');
        return;
      }
      showLibraryMessage(error.message);
    }
  }

  librarySearch.addEventListener('input', renderAll);
  document.querySelector('#logoutButton').addEventListener('click', async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
      window.location.replace('signin.html');
    } catch (error) {
      showLibraryMessage(error.message);
    }
  });

  start();
}
