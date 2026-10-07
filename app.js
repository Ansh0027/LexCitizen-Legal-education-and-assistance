const guides = document.querySelectorAll('.guide-card');
const categories = document.querySelectorAll('.category');
const searchInput = document.querySelector('#searchInput');
const resultCount = document.querySelector('#resultCount');
const emptyState = document.querySelector('#emptyState');
const toast = document.querySelector('#toast');
const dialog = document.querySelector('#guideDialog');
const dialogTitle = document.querySelector('#dialogTitle');
const dialogBody = document.querySelector('#dialogBody');
let activeCategory = 'all';
let toastTimer;
const guideSlugs = {
  'Article 21: Right to life & personal liberty': 'article-21-right-to-life',
  'Your 11 fundamental duties': 'fundamental-duties',
  'When a purchase goes wrong': 'consumer-protection-research',
  'The 73rd Amendment': '73rd-amendment-panchayats',
  'Article 14: Equality before the law': 'article-14-equality',
  'Ask the government: Right to Information': 'right-to-information',
  'Why the Preamble still matters': 'preamble-constitutional-theory',
};
let signedInUser = null;

async function loadCommunityUpdates() {
  try {
    const response = await fetch('/api/materials');
    if (!response.ok) throw new Error('Verified community updates are temporarily unavailable.');
    const { materials } = await response.json();
    const updates = materials.filter((material) => material.community_updated);
    if (updates.length === 0) return;

    const section = document.querySelector('#communityUpdates');
    const grid = document.querySelector('#communityUpdateGrid');
    grid.replaceChildren(...updates.map((material) => {
      const card = document.createElement('article');
      card.className = 'community-update-card';
      const category = document.createElement('p');
      category.className = 'section-eyebrow';
      category.textContent = material.category;
      const title = document.createElement('h3');
      title.textContent = material.title;
      const excerpt = document.createElement('p');
      excerpt.textContent = material.excerpt;
      const citation = document.createElement('p');
      citation.className = 'community-update-source';
      citation.textContent = `Verified source: ${material.source}`;
      if (material.source_url) {
        const sourceLink = document.createElement('a');
        sourceLink.href = material.source_url;
        sourceLink.target = '_blank';
        sourceLink.rel = 'noopener noreferrer';
        sourceLink.textContent = ' Open primary source ↗';
        citation.append(sourceLink);
      }
      const link = document.createElement('a');
      link.className = 'text-button';
      link.href = `reader.html?slug=${encodeURIComponent(material.slug)}`;
      link.textContent = 'Read verified update →';
      card.append(category, title, excerpt, citation, link);
      return card;
    }));
    section.hidden = false;
  } catch (error) {
    console.error('Could not load published community updates:', error);
  }
}

loadCommunityUpdates();

const guideCopy = {
  'Article 21: Right to life & personal liberty': 'Article 21 protects more than survival. Courts have read it as a promise of dignity, privacy, health, and a life lived with meaningful freedom. This explainer traces how one short provision became a living right.',
  'Your 11 fundamental duties': 'Article 51A lists eleven duties for citizens, from respecting the Constitution and protecting the environment to developing a scientific temper. They guide civic life, even when they are not framed as punishments.',
  'When a purchase goes wrong': 'The Consumer Protection Act gives buyers routes to seek repair, replacement, refund, or compensation. Start by preserving your bill, recording the issue, and approaching the right consumer forum.',
  'The 73rd Amendment': 'The 73rd Amendment gave Panchayats constitutional status and brought local self-government closer to the people. It created a three-tier structure and reserved representation for women and marginalised communities.',
  'Article 14: Equality before the law': 'Article 14 promises equality before the law and equal protection of the laws. That does not require identical treatment in every situation; it asks the law to use fair, intelligible distinctions.',
  'Ask the government: Right to Information': 'The RTI Act lets citizens request information held by public authorities. A clear, specific application and a small fee can open a window into how public decisions are made.',
  "Why the Preamble still matters": 'The Preamble is the Constitution\'s opening compass. Its words describe the kind of republic India commits to building: one grounded in justice, liberty, equality, and fraternity.',
};

document.querySelector('#rightsCategory').addEventListener('click', () => {
  window.location.href = 'fundamental-rights.html';
});

const categoryPages = {
  dutiesCategory: 'fundamental-duties.html',
  articlesCategory: 'key-articles.html',
  amendmentsCategory: 'amendments.html',
  lawsCategory: 'everyday-laws.html',
};

Object.entries(categoryPages).forEach(([id, page]) => {
  document.querySelector(`#${id}`).addEventListener('click', () => {
    window.location.href = page;
  });
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

async function accountRequest(url, options = {}) {
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

async function updateSavedState(slug, saved) {
  if (!signedInUser) {
    showToast('Sign in to keep readings in your personal library.');
    window.setTimeout(() => { window.location.href = 'signin.html'; }, 900);
    throw new Error('Sign in required.');
  }
  await accountRequest(`/api/me/saved/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ saved }),
  });
}

accountRequest('/api/auth/me')
  .then(({ user }) => {
    signedInUser = user;
    return accountRequest('/api/me/library');
  })
  .then(({ saved }) => {
    const savedSlugs = new Set(saved.map((item) => item.slug));
    document.querySelectorAll('.bookmark').forEach((button) => {
      const guideButton = button.closest('.guide-card')?.querySelector('[data-guide]');
      const slug = guideButton && guideSlugs[guideButton.dataset.guide];
      if (slug && savedSlugs.has(slug)) {
        button.classList.add('saved');
        button.textContent = '♥';
        button.setAttribute('aria-pressed', 'true');
      }
    });
  })
  .catch((error) => {
    if (error.message !== 'Not signed in.') console.error('Could not load saved reading state:', error);
  });

function updateGuides() {
  const query = searchInput.value.trim().toLowerCase();
  let visible = 0;
  guides.forEach((guide) => {
    const categoryMatch = activeCategory === 'all' || guide.dataset.category.split(' ').includes(activeCategory);
    const searchMatch = !query || guide.dataset.search.includes(query);
    const isVisible = categoryMatch && searchMatch;
    guide.classList.toggle('hidden', !isVisible);
    if (isVisible) visible += 1;
  });
  resultCount.textContent = `${visible} guide${visible === 1 ? '' : 's'}`;
  emptyState.hidden = visible !== 0;
}

categories.forEach((category) => {
  category.addEventListener('click', () => {
    categories.forEach((item) => item.classList.remove('active'));
    category.classList.add('active');
    activeCategory = category.dataset.category;
    updateGuides();
  });
});
searchInput.addEventListener('input', updateGuides);
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement !== searchInput) {
    event.preventDefault();
    searchInput.focus();
  }
});

document.querySelectorAll('.bookmark').forEach((button) => {
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', async () => {
    const guideButton = button.closest('.guide-card')?.querySelector('[data-guide]');
    const slug = guideButton && guideSlugs[guideButton.dataset.guide];
    if (!slug) {
      showToast('This reading is not available in the personal library yet.');
      return;
    }
    const saved = !button.classList.contains('saved');
    try {
      await updateSavedState(slug, saved);
      button.classList.toggle('saved', saved);
      button.textContent = saved ? '♥' : '♡';
      button.setAttribute('aria-pressed', String(saved));
      showToast(saved ? `${button.dataset.save} saved to your reading list` : `${button.dataset.save} removed from your reading list`);
    } catch (error) {
      if (error.message !== 'Sign in required.') showToast(error.message);
    }
  });
});

function openGuide(title) {
  dialogTitle.textContent = title;
  dialogBody.textContent = guideCopy[title] || 'This guide is being prepared with the same promise as the rest of LexCitizen: clear context, reliable sources, and a starting point for curious citizens.';
  const slug = guideSlugs[title];
  const articleLink = document.querySelector('#openFullArticle');
  articleLink.href = slug ? `reader.html?slug=${encodeURIComponent(slug)}` : 'user-dashboard.html';
  dialog.showModal();
}

document.querySelectorAll('[data-guide]').forEach((button) => button.addEventListener('click', () => openGuide(button.dataset.guide)));
document.querySelector('#dialogClose').addEventListener('click', () => dialog.close());
document.querySelector('#dialogSave').addEventListener('click', () => {
  const slug = guideSlugs[dialogTitle.textContent];
  if (!slug) {
    showToast('This reading is not available in the personal library yet.');
    return;
  }
  updateSavedState(slug, true)
    .then(() => {
      showToast(`${dialogTitle.textContent} saved to your reading list`);
      dialog.close();
    })
    .catch((error) => {
      if (error.message !== 'Sign in required.') showToast(error.message);
    });
});
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});

const menuButton = document.querySelector('#menuButton');
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!open));
  const navigation = document.querySelector('.main-nav');
  navigation.classList.toggle('mobile-open', !open);
  navigation.style.display = !open ? 'flex' : '';
});
