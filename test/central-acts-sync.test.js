const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createActRecord } = require('../src/modules/central-acts-sync');

test('India Code records retain official identifiers, metadata, provenance, and full text', () => {
  const record = createActRecord({
    uuid: 'b4966e6e-14e9-4c8f-a898-8228e50b4bab',
    name: 'Example Act, 2024',
    _links: { self: { href: 'https://indiacode.gov.in/server/api/core/items/b4966e6e-14e9-4c8f-a898-8228e50b4bab' } },
    metadata: {
      'dc.title': [{ value: 'Example Act, 2024' }],
      'dc.date.act_year': [{ value: '2024' }],
      'dc.date.last_modified': [{ value: '2024-06-01' }],
      'dc.identifier.act_number': [{ value: '7' }],
      'dc.identifier.ministry_name': [{ value: 'Ministry of Example' }],
      'dc.identifier.repealed': [{ value: 'No' }],
      'dc.identifier.uri': [{ value: 'https://indiacode.gov.in/handle/123456789/42' }],
      'dc.description.abstract': [{ value: 'An official <b>abstract</b>.' }],
      'dc.identifier.reference_sites': [{ value: 'https://example.gov.in/' }],
    },
  }, 'Official section text\n\nSection 1.');

  assert.equal(record.record_type, 'central_act');
  assert.equal(record.source_provider, 'india-code');
  assert.equal(record.source_item_id, 'b4966e6e-14e9-4c8f-a898-8228e50b4bab');
  assert.equal(record.act_year, 2024);
  assert.equal(record.act_number, '7');
  assert.equal(record.ministry, 'Ministry of Example');
  assert.equal(record.legal_status, 'No');
  assert.equal(record.excerpt, 'An official abstract.');
  assert.equal(record.body, 'Official section text\n\nSection 1.');
  assert.equal(record.official_text_available, true);
  assert.equal(record.source_url, 'https://indiacode.gov.in/handle/123456789/42');
  assert.deepEqual(record.source_metadata['dc.identifier.reference_sites'], ['https://example.gov.in/']);
});

test('India Code records preserve an explicit fallback when official text is absent', () => {
  const record = createActRecord({
    uuid: 'b4966e6e-14e9-4c8f-a898-8228e50b4bab',
    metadata: {
      'dc.title': [{ value: 'Example Act' }],
      'dc.identifier.preamble_description': [{ value: 'A &amp; B <p>preamble</p>' }],
    },
  }, '');

  assert.equal(record.body, 'A & B preamble');
  assert.equal(record.official_text_available, false);
  assert.equal(record.source_url, 'https://indiacode.gov.in/');
});
