const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ipcSectionsPath = path.join(__dirname, '..', 'public', 'ipc-sections.json');

test('IPC section index covers chapters, numbered sections, insertions, and historical statuses', () => {
  const sections = JSON.parse(fs.readFileSync(ipcSectionsPath, 'utf8'));
  const chapterNumbers = [...new Set(sections.map((section) => section.chapter))].sort((a, b) => a - b);
  const expectedChapters = Array.from({ length: 23 }, (_, index) => index + 1);
  const sectionNumbers = new Set(sections.map((section) => section.sectionNumber));
  const validStatuses = new Set(['provision', 'repealed', 'omitted']);

  assert.deepEqual(chapterNumbers, expectedChapters);
  for (let sectionNumber = 1; sectionNumber <= 511; sectionNumber += 1) {
    assert.ok(sectionNumbers.has(String(sectionNumber)), `Missing IPC section ${sectionNumber}`);
  }
  assert.ok(sections.some((section) => /[A-Za-z]$/.test(section.sectionNumber)), 'Expected inserted section numbers');
  assert.ok(sections.some((section) => section.status === 'repealed'));
  assert.ok(sections.some((section) => section.status === 'omitted'));

  for (const section of sections) {
    assert.equal(typeof section.chapterTitle, 'string');
    assert.equal(typeof section.title, 'string');
    assert.equal(typeof section.summary, 'string');
    assert.ok(validStatuses.has(section.status), `Invalid status for section ${section.sectionNumber}`);
  }
});
