const assert = require('node:assert/strict');
const { test } = require('node:test');
const { generateStudyAid } = require('../src/modules/openai-study-aids');

const material = {
  title: 'Example Act',
  category: 'Central Acts',
  excerpt: 'A sample official Act.',
  source: 'Example Act, 2024',
  body: 'Section 1 establishes the purpose of this Act. Section 2 defines its key terms.',
};

test('OpenAI generates validated study aids without storing provider-side responses', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.OPENAI_MODEL;
  const previousFetch = global.fetch;
  process.env.OPENAI_API_KEY = 'test-secret';
  process.env.OPENAI_MODEL = 'gpt-test-model';
  const outputs = {
    legal_study_summary: { summary: 'A concise source-based summary.', key_points: ['Purpose', 'Definitions', 'Scope'] },
    legal_revision_flashcards: {
      cards: [
        { front: 'What does Section 1 establish?', back: 'The purpose of the Act.' },
        { front: 'Where are key terms defined?', back: 'Section 2.' },
        { front: 'What should readers verify?', back: 'The exact current legal text.' },
      ],
    },
    legal_short_notes: {
      title: 'Example Act: short notes',
      sections: [{ heading: 'Structure', bullets: ['Section 1 states the purpose.', 'Section 2 defines key terms.'] }],
    },
  };
  const requests = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, options, body });
    const output = outputs[body.text.format.name];
    return new Response(JSON.stringify({
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify(output) }],
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const summary = await generateStudyAid('summary', material);
    const flashcards = await generateStudyAid('flashcards', material);
    const notes = await generateStudyAid('notes', material);
    assert.equal(summary.content.summary, outputs.legal_study_summary.summary);
    assert.equal(flashcards.content.cards.length, 3);
    assert.equal(notes.content.sections[0].heading, 'Structure');
    assert.equal(requests.length, 3);
    requests.forEach(({ url, options, body }) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(options.headers.Authorization, 'Bearer test-secret');
      assert.equal(body.store, false);
      assert.match(body.instructions, /untrusted source data/i);
      assert.match(body.input, /Section 1 establishes/);
    });
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previousModel;
  }
});

test('OpenAI study tools fail clearly when the server key is not configured', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = global.fetch;
  delete process.env.OPENAI_API_KEY;
  global.fetch = async () => {
    throw new Error('Fetch must not be called without an API key.');
  };
  try {
    await assert.rejects(
      generateStudyAid('summary', material),
      (error) => error.status === 503 && /OPENAI_API_KEY/.test(error.message),
    );
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
