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
  button.addEventListener('click', () => {
    const saved = button.classList.toggle('saved');
    button.textContent = saved ? '♥' : '♡';
    showToast(saved ? `${button.dataset.save} saved to your reading list` : `${button.dataset.save} removed from your reading list`);
  });
});

function openGuide(title) {
  dialogTitle.textContent = title;
  dialogBody.textContent = guideCopy[title] || 'This guide is being prepared with the same promise as the rest of LexCitizen: clear context, reliable sources, and a starting point for curious citizens.';
  dialog.showModal();
}

document.querySelectorAll('[data-guide]').forEach((button) => button.addEventListener('click', () => openGuide(button.dataset.guide)));
document.querySelector('#dialogClose').addEventListener('click', () => dialog.close());
document.querySelector('#dialogSave').addEventListener('click', () => {
  showToast(`${dialogTitle.textContent} saved to your reading list`);
  dialog.close();
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
