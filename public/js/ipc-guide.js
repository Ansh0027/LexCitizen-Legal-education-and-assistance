const ipcSearch = document.getElementById('ipcSearch');
const ipcChapters = document.getElementById('ipcChapters');
const ipcSectionCount = document.getElementById('ipcSectionCount');
const ipcLoadStatus = document.getElementById('ipcLoadStatus');
const validStatuses = new Set(['provision', 'repealed', 'omitted']);

function validateSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) {
    throw new Error('The IPC section index must be a non-empty array.');
  }

  for (const section of sections) {
    if (
      !Number.isInteger(section.chapter) ||
      typeof section.chapterTitle !== 'string' ||
      typeof section.sectionNumber !== 'string' ||
      typeof section.title !== 'string' ||
      typeof section.summary !== 'string' ||
      !validStatuses.has(section.status)
    ) {
      throw new Error('The IPC section index contains an invalid entry.');
    }
  }

  const chapterNumbers = new Set(sections.map((section) => section.chapter));
  if (chapterNumbers.size !== 23) {
    throw new Error(`Expected 23 IPC chapters, found ${chapterNumbers.size}.`);
  }
}

function createSectionEntry(section) {
  const entry = document.createElement('article');
  entry.className = 'ipc-section';
  entry.dataset.search = [
    section.chapter,
    section.chapterTitle,
    section.sectionNumber,
    section.title,
    section.summary,
    section.status,
  ].join(' ').toLocaleLowerCase();

  const number = document.createElement('span');
  number.className = 'ipc-section-number';
  number.textContent = `Section ${section.sectionNumber}`;

  const content = document.createElement('div');
  const heading = document.createElement('div');
  heading.className = 'ipc-section-heading';

  const title = document.createElement('span');
  title.className = 'ipc-section-title';
  title.textContent = section.title;
  heading.append(title);

  if (section.status !== 'provision') {
    const status = document.createElement('span');
    status.className = 'ipc-section-status';
    status.textContent = section.status;
    heading.append(status);
  }

  const summary = document.createElement('p');
  summary.className = 'ipc-section-summary';
  summary.textContent = section.summary;
  content.append(heading, summary);
  entry.append(number, content);
  return entry;
}

function renderChapters(sections) {
  const groups = new Map();
  for (const section of sections) {
    if (!groups.has(section.chapter)) {
      groups.set(section.chapter, {
        title: section.chapterTitle,
        sections: [],
      });
    } else if (groups.get(section.chapter).title !== section.chapterTitle) {
      throw new Error(`Chapter ${section.chapter} has conflicting titles.`);
    }
    groups.get(section.chapter).sections.push(section);
  }

  ipcChapters.replaceChildren();
  for (const [chapterNumber, chapter] of groups) {
    const details = document.createElement('details');
    details.className = 'ipc-chapter';

    const summary = document.createElement('summary');
    const number = document.createElement('span');
    number.className = 'ipc-chapter-number';
    number.textContent = `Chapter ${chapterNumber}`;
    const title = document.createElement('span');
    title.className = 'ipc-chapter-title';
    title.textContent = chapter.title;
    const count = document.createElement('span');
    count.className = 'ipc-chapter-count';
    count.textContent = `${chapter.sections.length} sections`;
    summary.append(number, title, count);

    const list = document.createElement('div');
    list.className = 'ipc-section-list';
    for (const section of chapter.sections) {
      list.append(createSectionEntry(section));
    }

    details.append(summary, list);
    ipcChapters.append(details);
  }

  ipcSectionCount.textContent = `${sections.length} sections · ${groups.size} chapters`;
}

ipcSearch.addEventListener('input', () => {
  const query = ipcSearch.value.trim().toLocaleLowerCase();
  let visibleCount = 0;

  for (const chapter of ipcChapters.querySelectorAll('.ipc-chapter')) {
    let chapterCount = 0;
    for (const section of chapter.querySelectorAll('.ipc-section')) {
      const matches = !query || section.dataset.search.includes(query);
      section.hidden = !matches;
      if (matches) chapterCount += 1;
    }
    chapter.hidden = chapterCount === 0;
    if (query && chapterCount > 0) chapter.open = true;
    visibleCount += chapterCount;
  }

  ipcSectionCount.textContent = query
    ? `${visibleCount} matching sections`
    : `${ipcChapters.querySelectorAll('.ipc-section').length} sections · ${ipcChapters.querySelectorAll('.ipc-chapter').length} chapters`;
});

fetch(new URL('ipc-sections.json', document.currentScript.src))
  .then((response) => {
    if (!response.ok) {
      throw new Error(`IPC section data request failed with status ${response.status}.`);
    }
    return response.json();
  })
  .then((sections) => {
    validateSections(sections);
    renderChapters(sections);
  })
  .catch((error) => {
    console.error('Unable to load IPC section data.', error);
    ipcChapters.replaceChildren(ipcLoadStatus);
    ipcLoadStatus.classList.add('error');
    ipcLoadStatus.textContent = 'The IPC section index could not be loaded. Please reload the page or try again later.';
    ipcSectionCount.textContent = 'Section index unavailable';
  });
