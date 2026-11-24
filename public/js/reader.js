const readerPage = document.querySelector('#readerPage');

if (readerPage) {
  const message = document.querySelector('#readerMessage');
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  const progressLabel = document.querySelector('#readerProgressLabel');
  const progressTrack = document.querySelector('.reader-progress-track[role="progressbar"]');
  const progressFill = document.querySelector('#readerProgressFill');
  const studyAidTypes = ['summary', 'flashcards', 'notes'];
  const studyAidLabels = {
    summary: 'summary',
    flashcards: 'flashcards',
    notes: 'short notes',
  };
  const studyAidResults = document.querySelector('#readerAiResults');
  const studyAidMessage = document.querySelector('#readerAiMessage');
  const studyAidSignin = document.querySelector('#readerAiSignin');
  const studyAidSigninLink = document.querySelector('#readerAiSigninLink');
  const savedStudyAids = {};
  let saved = false;
  let signedIn = false;
  let progressTimer;
  let progressFrame;
  let textScale = 1;

  const learningIdeas = {
    'article-21-right-to-life': [
      ['21', 'The constitutional text', 'Article 21 protects life and personal liberty, subject to procedure established by law.'],
      ['↗', 'How courts read it', 'The explainer describes how the Supreme Court has interpreted the protection in later cases.'],
      ['!', 'Context matters', 'The exact scope of a right depends on the facts and the law a court applies.'],
    ],
    'article-14-equality': [
      ['14', 'Two linked guarantees', 'Article 14 speaks of equality before the law and equal protection of the laws.'],
      ['=', 'Fairness is not sameness', 'The law may distinguish between situations when the distinction has a rational connection to a legitimate purpose.'],
      ['?', 'Ask how it applies', 'Whether a classification is constitutional depends on the facts and the applicable legal test.'],
    ],
    'fundamental-duties': [
      ['51A', 'A civic guide', 'Article 51A lists responsibilities such as respecting the Constitution and protecting the natural environment.'],
      ['11', 'Eleven duties', 'The Constitution includes eleven duties, covering civic life, public property, scientific temper, and more.'],
      ['↗', 'Look to the context', 'The legal effect of a duty depends on the relevant statute and situation.'],
    ],
    '73rd-amendment-panchayats': [
      ['73', 'Constitutional recognition', 'The 73rd Amendment inserted Part IX and gave Panchayats constitutional recognition.'],
      ['3', 'Local self-government', 'Part IX provides a general three-tier structure, subject to its provisions and exceptions.'],
      ['⌂', 'States shape the details', 'Panchayat powers and responsibilities also depend on state legislation.'],
    ],
    'preamble-constitutional-theory': [
      ['01', 'A statement of purpose', 'The Preamble expresses values and aims that help explain the constitutional order.'],
      ['4', 'Four guiding commitments', 'Justice, liberty, equality, and fraternity are named in the Preamble.'],
      ['§', 'Read it with the text', 'The Preamble helps explain constitutional purpose alongside the operative provisions.'],
    ],
    'consumer-protection-research': [
      ['01', 'Preserve the record', 'Keep bills, receipts, and communications connected with the transaction.'],
      ['02', 'Find the right forum', 'Check the current law and verify which consumer forum has jurisdiction.'],
      ['03', 'Check the time limits', 'Limitation periods and available remedies depend on the circumstances and current law.'],
    ],
    'right-to-information': [
      ['2005', 'A request framework', 'The RTI Act establishes a way for citizens to request information held by public authorities.'],
      ['→', 'Be specific', 'Identify the public authority and ask for clear, existing records.'],
      ['↗', 'Follow the process', 'Check current requirements, fees, exemptions, deadlines, and appeal routes.'],
    ],
    'privacy-judgment-puttaswamy': [
      ['2017', 'A nine-judge decision', 'The Supreme Court recognised privacy as a fundamental right in Puttaswamy.'],
      ['◎', 'Connected values', 'The judgment discusses privacy in relation to liberty, dignity, autonomy, and constitutional guarantees.'],
      ['↗', 'Read later authorities', 'How the principles apply to a particular issue depends on later law and the facts.'],
    ],
  };

  document.body.classList.add('reader-motion-ready');
  const revealItems = document.querySelectorAll('.reveal-on-scroll');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealItems.forEach((item) => revealObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-visible'));
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

  function showMessage(text, type = 'error') {
    message.textContent = text;
    message.className = `reader-message ${type}`;
    message.hidden = false;
  }

  function showStudyAidMessage(text, type = 'error') {
    studyAidMessage.textContent = text;
    studyAidMessage.className = `reader-ai-message ${type}`;
    studyAidMessage.hidden = false;
  }

  function makeTextElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    return element;
  }

  function renderStudyAid(type, aid) {
    const card = document.createElement('article');
    card.className = 'reader-ai-aid';
    const content = aid.content;

    if (type === 'summary') {
      card.append(makeTextElement('h3', '', 'AI summary'));
      card.append(makeTextElement('p', '', content.summary));
      card.append(makeTextElement('h4', '', 'Key points'));
      const points = document.createElement('ul');
      content.key_points.forEach((point) => points.append(makeTextElement('li', '', point)));
      card.append(points);
    } else if (type === 'flashcards') {
      card.append(makeTextElement('h3', '', 'Revision flashcards'));
      content.cards.forEach((flashcard) => {
        const details = document.createElement('details');
        details.className = 'reader-ai-flashcard';
        const question = makeTextElement('summary', '', flashcard.front);
        const answer = makeTextElement('p', '', flashcard.back);
        details.append(question, answer);
        card.append(details);
      });
    } else {
      card.append(makeTextElement('h3', '', content.title));
      content.sections.forEach((section) => {
        card.append(makeTextElement('h4', '', section.heading));
        const bullets = document.createElement('ul');
        section.bullets.forEach((bullet) => bullets.append(makeTextElement('li', '', bullet)));
        card.append(bullets);
      });
    }

    const generatedAt = aid.generated_at ? new Date(aid.generated_at).toLocaleString() : '';
    const details = [aid.model, generatedAt].filter(Boolean).join(' · ');
    if (details) card.append(makeTextElement('p', 'reader-ai-aid-meta', `Generated with ${details}`));
    if (aid.stale) {
      card.append(makeTextElement('p', 'reader-ai-aid-meta', 'The source reading has changed. Regenerate this aid to update it.'));
    }

    const regenerate = makeTextElement('button', 'reader-ai-regenerate', `Regenerate ${studyAidLabels[type]}`);
    regenerate.type = 'button';
    regenerate.addEventListener('click', () => generateStudyAid(type, true));
    card.append(regenerate);
    return card;
  }

  function renderSavedStudyAids() {
    studyAidResults.replaceChildren(...studyAidTypes
      .filter((type) => savedStudyAids[type])
      .map((type) => renderStudyAid(type, savedStudyAids[type])));
    document.querySelectorAll('[data-ai-study-type]').forEach((button) => {
      const type = button.dataset.aiStudyType;
      const action = savedStudyAids[type] ? 'Regenerate' : 'Make';
      button.textContent = `${action} ${studyAidLabels[type]}`;
    });
  }

  async function loadSavedStudyAids() {
    if (!signedIn) {
      studyAidSigninLink.href = signInUrl();
      studyAidSignin.hidden = false;
      return;
    }
    studyAidSignin.hidden = true;
    try {
      const { aids } = await apiRequest(`/api/me/study-aids/${encodeURIComponent(slug)}`);
      Object.assign(savedStudyAids, aids);
      renderSavedStudyAids();
    } catch (error) {
      showStudyAidMessage(error.message);
    }
  }

  async function generateStudyAid(type, force = false) {
    if (!signedIn) {
      window.location.href = signInUrl();
      return;
    }
    const button = document.querySelector(`[data-ai-study-type="${type}"]`);
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = `Generating ${studyAidLabels[type]}...`;
    studyAidMessage.hidden = true;
    try {
      const result = await apiRequest(`/api/me/study-aids/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, force }),
      });
      savedStudyAids[type] = result.aid;
      renderSavedStudyAids();
      showStudyAidMessage(
        result.cached ? 'Your saved study aid is ready.' : 'Generated and saved privately to your account.',
        'success',
      );
    } catch (error) {
      showStudyAidMessage(error.message);
      button.textContent = originalText;
    } finally {
      button.disabled = false;
    }
  }

  function currentProgress() {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    return scrollable <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((window.scrollY / scrollable) * 100)));
  }

  function updateProgressDisplay() {
    const position = currentProgress();
    progressFill.style.width = `${position}%`;
    progressTrack.setAttribute('aria-valuenow', String(position));
    const suffix = signedIn
      ? 'Progress saved to your account'
      : 'Sign in to save your progress';
    progressLabel.textContent = `${position}% read · ${suffix}`;
  }

  async function saveProgress(keepalive = false) {
    if (!signedIn || !slug || !document.querySelector('#readerBody').hasChildNodes()) return;
    const positionPercent = currentProgress();
    updateProgressDisplay();
    const request = fetch(`/api/me/progress/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      credentials: 'same-origin',
      keepalive,
      headers: { 'Content-Type': 'application/json', 'X-LexCitizen-Request': '1' },
      body: JSON.stringify({ positionPercent }),
    });
    if (keepalive) {
      request.catch((error) => console.error('Final reading progress update failed:', error));
      return;
    }
    try {
      const response = await request;
      if (!response.ok) {
        const result = await response.json();
        showMessage(result.error || 'Reading progress could not be saved.');
      }
    } catch {
      showMessage('Reading progress could not be saved. Check your connection and try again.');
    }
  }

  function scheduleProgressSave() {
    if (progressFrame) return;
    progressFrame = window.requestAnimationFrame(() => {
      progressFrame = null;
      updateProgressDisplay();
      if (signedIn) {
        window.clearTimeout(progressTimer);
        progressTimer = window.setTimeout(() => saveProgress(), 700);
      }
    });
  }

  function renderLearningIdeas(material) {
    const ideas = learningIdeas[material.slug] || [
      ['01', 'Find the legal source', 'Use the citation and primary source linked below to explore the rule in its original context.'],
      ['02', 'Notice the context', 'Look for the facts, the legal question, and the authority the explainer relies on.'],
      ['03', 'Pause before applying', 'A general explainer is a starting point. Individual situations can depend on specific facts and current law.'],
    ];
    const grid = document.querySelector('#readerIdeaGrid');
    grid.replaceChildren(...ideas.map(([mark, title, detail], index) => {
      const card = document.createElement('details');
      card.className = 'reader-idea-card';
      card.style.setProperty('--card-order', String(index));
      const summary = document.createElement('summary');
      const marker = document.createElement('span');
      marker.className = 'reader-idea-mark';
      marker.setAttribute('aria-hidden', 'true');
      marker.textContent = mark;
      const heading = document.createElement('span');
      heading.className = 'reader-idea-title';
      heading.textContent = title;
      const toggle = document.createElement('span');
      toggle.className = 'reader-idea-toggle';
      toggle.setAttribute('aria-hidden', 'true');
      toggle.textContent = '+';
      summary.append(marker, heading, toggle);
      const description = document.createElement('p');
      description.textContent = detail;
      card.append(summary, description);
      return card;
    }));
  }

  function signInUrl() {
    const destination = `reader.html?slug=${encodeURIComponent(slug)}`;
    return `signin.html?next=${encodeURIComponent(destination)}`;
  }

  function renderAssessmentStages(assessments) {
    const section = document.querySelector('#readerCheck');
    const stages = document.querySelector('#readerAssessmentStages');
    const stageOrder = ['practice', 'quiz', 'test'];
    const stageMarks = { practice: '↗', quiz: '?', test: '✓' };

    stages.replaceChildren(...stageOrder.map((type, index) => {
      const assessment = assessments[type];
      const card = document.createElement('article');
      card.className = 'learning-stage-card';
      card.style.setProperty('--card-order', String(index));

      const heading = document.createElement('div');
      heading.className = 'learning-stage-heading';
      const mark = document.createElement('span');
      mark.className = `learning-stage-mark ${type}`;
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = stageMarks[type];
      const title = document.createElement('h3');
      title.textContent = assessment.title;
      heading.append(mark, title);

      const introduction = document.createElement('p');
      introduction.className = 'learning-stage-introduction';
      introduction.textContent = assessment.introduction;

      const form = document.createElement('form');
      form.className = 'reader-quiz learning-assessment-form';
      form.id = type === 'quiz' ? 'readerQuiz' : `readerAssessment-${type}`;
      assessment.questions.forEach((question) => {
        const fieldset = document.createElement('fieldset');
        fieldset.dataset.questionId = question.id;
        const legend = document.createElement('legend');
        legend.className = 'reader-quiz-question';
        legend.textContent = question.prompt;
        fieldset.append(legend);
        question.choices.forEach((choice) => {
          const label = document.createElement('label');
          label.className = 'reader-quiz-option';
          label.dataset.choiceId = choice.id;
          const input = document.createElement('input');
          input.type = 'radio';
          input.name = `answer-${question.id}`;
          input.value = choice.id;
          input.required = true;
          const text = document.createElement('span');
          text.textContent = choice.text;
          label.append(input, text);
          fieldset.append(label);
        });
        form.append(fieldset);
      });

      const submit = document.createElement('button');
      submit.className = 'solid-button reader-quiz-submit';
      submit.type = 'submit';
      submit.textContent = signedIn ? 'Submit answers' : 'Sign in to save score';
      submit.disabled = !signedIn;
      form.append(submit);
      card.append(heading, introduction, form);

      if (signedIn) {
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const answers = assessment.questions.map((question) => {
            const selected = form.querySelector(`input[name="answer-${question.id}"]:checked`);
            return { questionId: question.id, choiceId: selected ? selected.value : '' };
          });
          if (answers.some((answer) => !answer.choiceId)) {
            form.reportValidity();
            return;
          }

          submit.disabled = true;
          submit.textContent = 'Checking and saving…';
          try {
            const result = await apiRequest('/api/me/assessments', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slug, type, answers }),
            });
            form.querySelectorAll('fieldset').forEach((fieldset) => {
              fieldset.disabled = true;
              const answer = result.results.find((item) => item.questionId === fieldset.dataset.questionId);
              fieldset.querySelectorAll('.reader-quiz-option').forEach((option) => {
                if (option.dataset.choiceId === answer.correctChoiceId) option.classList.add('is-correct');
                else if (option.querySelector('input').checked) option.classList.add('is-incorrect');
              });
              const explanation = document.createElement('p');
              explanation.className = 'learning-answer-explanation';
              explanation.textContent = answer.explanation;
              fieldset.append(explanation);
            });
            const score = document.createElement('div');
            score.className = 'learning-score-result';
            const percentage = document.createElement('strong');
            percentage.className = 'learning-score-percentage';
            percentage.textContent = `${result.attempt.percentage}%`;
            const scoreText = document.createElement('p');
            scoreText.textContent = `Score: ${result.attempt.score}/${result.attempt.maxScore}. Saved to your learning dashboard.`;
            score.append(percentage, scoreText);
            card.append(score);
            submit.textContent = 'Score saved';
          } catch (error) {
            submit.disabled = false;
            submit.textContent = 'Try submitting again';
            showMessage(error.message);
          }
        });
      } else {
        const signInNote = document.createElement('p');
        signInNote.className = 'learning-signin-note';
        signInNote.textContent = 'Sign in to record your answers and save this score.';
        const signInLink = document.createElement('a');
        signInLink.href = signInUrl();
        signInLink.textContent = 'Sign in';
        card.append(signInNote, signInLink);
      }

      return card;
    }));
    section.hidden = false;
  }

  async function renderRelatedReadings(material) {
    const { materials } = await apiRequest('/api/materials');
    const related = materials
      .filter((item) => item.slug !== material.slug)
      .sort((left, right) => Number(right.category === material.category) - Number(left.category === material.category))
      .slice(0, 3);
    if (!related.length) return;

    const grid = document.querySelector('#readerRelatedGrid');
    grid.replaceChildren(...related.map((item, index) => {
      const link = document.createElement('a');
      link.className = 'reader-related-card';
      link.href = `reader.html?slug=${encodeURIComponent(item.slug)}`;
      link.style.setProperty('--card-order', String(index));
      const category = document.createElement('span');
      category.className = 'section-eyebrow';
      category.textContent = item.category;
      const title = document.createElement('strong');
      title.textContent = item.title;
      const action = document.createElement('span');
      action.className = 'reader-related-action';
      action.textContent = 'Explore this idea →';
      link.append(category, title, action);
      return link;
    }));
    document.querySelector('#readerRelated').hidden = false;
    if ('IntersectionObserver' in window) {
      grid.querySelectorAll('.reader-related-card').forEach((card) => {
        card.classList.add('reveal-on-scroll');
        card.classList.add('is-visible');
      });
    }
  }

  async function loadReader() {
    try {
      if (!slug) throw new Error('Choose a reading from your library first.');
      const { material } = await apiRequest(`/api/materials/${encodeURIComponent(slug)}`);
      let previousProgress = 0;
      try {
        await apiRequest('/api/auth/me');
        signedIn = true;
        const library = await apiRequest('/api/me/library');
        saved = library.saved.some((item) => item.slug === slug);
        previousProgress = library.progress.find((item) => item.slug === slug)?.position_percent || 0;
      } catch (error) {
        if (error.message !== 'Not signed in.' && error.message !== 'Please sign in to continue.') throw error;
      }
      await loadSavedStudyAids();
      document.title = `${material.title} | LexCitizen`;
      document.querySelector('#readerCategory').textContent = material.category;
      document.querySelector('#readerTitle').textContent = material.title;
      document.querySelector('#readerExcerpt').textContent = material.excerpt;
      document.querySelector('#readerSource').textContent = material.source;
      const words = material.body.trim().split(/\s+/).length;
      document.querySelector('#readerReadingTime').textContent = `${Math.max(1, Math.ceil(words / 190))} min read`;
      const sourceLink = document.querySelector('#readerSourceLink');
      if (material.source_url) {
        sourceLink.href = material.source_url;
      } else {
        sourceLink.hidden = true;
      }
      const body = document.querySelector('#readerBody');
      body.replaceChildren(...material.body.split(/\n\n+/).map((text, index) => {
        const paragraph = document.createElement('p');
        paragraph.className = 'reader-paragraph';
        paragraph.style.setProperty('--paragraph-order', String(index));
        paragraph.textContent = text;
        return paragraph;
      }));
      renderLearningIdeas(material);
      try {
        const { assessments } = await apiRequest(`/api/materials/${encodeURIComponent(slug)}/assessments`);
        renderAssessmentStages(assessments);
      } catch (error) {
        console.error('Could not load learning activities:', error);
        showMessage('Learning activities could not be loaded. Please refresh the page to try again.');
      }
      await renderRelatedReadings(material).catch((error) => {
        console.error('Could not load related readings:', error);
      });

      const saveButton = document.querySelector('#readerSave');
      const logoutButton = document.querySelector('#readerLogout');
      logoutButton.hidden = !signedIn;
      logoutButton.style.display = signedIn ? '' : 'none';
      saveButton.textContent = signedIn ? (saved ? 'Remove saved reading' : 'Save reading') : 'Sign in to save reading';
      saveButton.setAttribute('aria-pressed', String(signedIn && saved));
      updateProgressDisplay();

      window.requestAnimationFrame(() => {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        if (signedIn && previousProgress > 0 && scrollable > 0) {
          window.scrollTo(0, Math.round(scrollable * previousProgress / 100));
        }
        updateProgressDisplay();
      });

      saveButton.addEventListener('click', async () => {
        if (!signedIn) {
          window.location.href = `signin.html?next=${encodeURIComponent(`reader.html?slug=${slug}`)}`;
          return;
        }
        try {
          saved = !saved;
          await apiRequest(`/api/me/saved/${encodeURIComponent(slug)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ saved }),
          });
          saveButton.textContent = saved ? 'Remove saved reading' : 'Save reading';
          saveButton.setAttribute('aria-pressed', String(saved));
          showMessage(saved ? 'Added to your saved readings.' : 'Removed from your saved readings.', 'success');
        } catch (error) {
          saved = !saved;
          showMessage(error.message);
        }
      });
      window.addEventListener('scroll', scheduleProgressSave, { passive: true });
      window.addEventListener('pagehide', () => {
        window.clearTimeout(progressTimer);
        saveProgress(true);
      });
    } catch (error) {
      showMessage(error.message);
    }
  }

  document.querySelector('#readerTextSmaller').addEventListener('click', () => {
    textScale = Math.max(0.9, Number((textScale - 0.05).toFixed(2)));
    readerPage.style.setProperty('--reader-text-scale', String(textScale));
  });
  document.querySelector('#readerTextLarger').addEventListener('click', () => {
    textScale = Math.min(1.3, Number((textScale + 0.05).toFixed(2)));
    readerPage.style.setProperty('--reader-text-scale', String(textScale));
  });

  document.querySelectorAll('[data-ai-study-type]').forEach((button) => {
    button.addEventListener('click', () => {
      const type = button.dataset.aiStudyType;
      generateStudyAid(type, Boolean(savedStudyAids[type] && !savedStudyAids[type].stale));
    });
  });

  document.querySelector('#readerLogout').addEventListener('click', async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
      window.location.replace('signin.html');
    } catch (error) {
      showMessage(error.message);
    }
  });

  updateProgressDisplay();
  loadReader();
}
