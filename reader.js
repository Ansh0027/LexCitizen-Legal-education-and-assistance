const readerPage = document.querySelector('#readerPage');

if (readerPage) {
  const message = document.querySelector('#readerMessage');
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  let saved = false;
  let signedIn = false;
  let progressTimer;

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

  function currentProgress() {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    return scrollable <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((window.scrollY / scrollable) * 100)));
  }

  async function saveProgress(keepalive = false) {
    if (!signedIn || !slug || !document.querySelector('#readerBody').hasChildNodes()) return;
    const positionPercent = currentProgress();
    document.querySelector('#readerProgressLabel').textContent = `${positionPercent}% read · Progress saved to your account`;
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
    window.clearTimeout(progressTimer);
    progressTimer = window.setTimeout(() => saveProgress(), 700);
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
      document.title = `${material.title} | LexCitizen`;
      document.querySelector('#readerCategory').textContent = material.category;
      document.querySelector('#readerTitle').textContent = material.title;
      document.querySelector('#readerExcerpt').textContent = material.excerpt;
      document.querySelector('#readerSource').textContent = material.source;
      const sourceLink = document.querySelector('#readerSourceLink');
      if (material.source_url) {
        sourceLink.href = material.source_url;
      } else {
        sourceLink.hidden = true;
      }
      const body = document.querySelector('#readerBody');
      body.replaceChildren(...material.body.split(/\n\n+/).map((text) => {
        const paragraph = document.createElement('p');
        paragraph.textContent = text;
        return paragraph;
      }));
      const saveButton = document.querySelector('#readerSave');
      const logoutButton = document.querySelector('#readerLogout');
      logoutButton.hidden = !signedIn;
      logoutButton.style.display = signedIn ? '' : 'none';
      saveButton.textContent = signedIn ? (saved ? 'Remove saved reading' : 'Save reading') : 'Sign in to save reading';
      saveButton.setAttribute('aria-pressed', String(signedIn && saved));
      document.querySelector('#readerProgressLabel').textContent = signedIn
        ? `${previousProgress}% read · Progress saved to your account`
        : 'Sign in to save your reading progress across visits.';

      window.requestAnimationFrame(() => {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        if (signedIn && previousProgress > 0 && scrollable > 0) {
          window.scrollTo(0, Math.round(scrollable * previousProgress / 100));
        }
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
      if (signedIn) {
        window.addEventListener('scroll', scheduleProgressSave, { passive: true });
        window.addEventListener('pagehide', () => {
          window.clearTimeout(progressTimer);
          saveProgress(true);
        });
      }
    } catch (error) {
      showMessage(error.message);
    }
  }

  document.querySelector('#readerLogout').addEventListener('click', async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
      window.location.replace('signin.html');
    } catch (error) {
      showMessage(error.message);
    }
  });

  loadReader();
}
