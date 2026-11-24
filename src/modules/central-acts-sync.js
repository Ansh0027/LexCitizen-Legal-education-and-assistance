const Material = require('../models/material.model');

const API_ROOT = 'https://indiacode.gov.in/server/api';
const COLLECTION_ID = '69a0c1fb-7b22-4481-b16a-1dc59b5d02e6';
const PROVIDER = 'india-code';
const PAGE_SIZE = 100;
const WORKERS = 3;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const HTML_ENTITIES = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

let syncInProgress;
let requestGate = Promise.resolve();
let lastRequestAt = 0;

async function paceRequest() {
  let release;
  const turn = new Promise((resolve) => {
    release = resolve;
  });
  const previous = requestGate;
  requestGate = turn;
  await previous;
  try {
    const wait = Math.max(0, 125 - (Date.now() - lastRequestAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
  } finally {
    release();
  }
}

function firstValue(metadata, key) {
  const value = metadata[key];
  if (Array.isArray(value)) return value[0]?.value || '';
  return value?.value || '';
}

function cleanText(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
      if (code[0] === '#') {
        const hex = code[1]?.toLowerCase() === 'x';
        const number = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
        return Number.isInteger(number) && number > 0 && number <= 0x10ffff
          && (number < 0xd800 || number > 0xdfff)
          ? String.fromCodePoint(number)
          : ' ';
      }
      return HTML_ENTITIES[code.toLowerCase()] || ' ';
    })
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function slugify(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'central-act';
}

function itemMetadata(item) {
  return item.metadata || item._embedded?.indexableObject?.metadata || {};
}

function itemLinks(item) {
  return item._links || item._embedded?.indexableObject?._links || {};
}

function sourceMetadata(item) {
  const metadata = itemMetadata(item);
  return Object.fromEntries(Object.entries(metadata).map(([key, values]) => [
    key,
    Array.isArray(values) ? values.map((entry) => entry.value) : [values?.value].filter(Boolean),
  ]));
}

function safeApiUrl(value) {
  const url = new URL(value, API_ROOT);
  if (url.protocol !== 'https:' || url.hostname !== 'indiacode.gov.in'
      || !url.pathname.startsWith('/server/api/')) {
    throw new Error(`India Code returned an unexpected API link: ${url.origin}${url.pathname}`);
  }
  return url;
}

function paginationLink(response) {
  const href = response._embedded?.searchResult?._links?.next?.href;
  return href ? safeApiUrl(href).href : null;
}

async function fetchWithLimit(url) {
  await paceRequest();
  const response = await fetch(url, {
    headers: { Accept: 'application/hal+json, application/json, text/plain' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    if (response.status === 404) return null;
    const error = new Error(`India Code request failed (${response.status}): ${url.pathname}`);
    const retryAfter = response.headers.get('retry-after');
    const retryAfterSeconds = Number(retryAfter);
    error.retryAfterMs = Number.isFinite(retryAfterSeconds)
      ? Math.min(retryAfterSeconds * 1000, 60000)
      : retryAfter ? Math.max(0, Math.min(Date.parse(retryAfter) - Date.now(), 60000)) : 0;
    throw error;
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error(`India Code response exceeded ${MAX_RESPONSE_BYTES} bytes: ${url.pathname}`);
  }
  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error(`India Code response exceeded ${MAX_RESPONSE_BYTES} bytes: ${url.pathname}`);
  }
  return { body: Buffer.from(body), contentType: response.headers.get('content-type') || '' };
}

async function fetchWithRetries(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fetchWithLimit(safeApiUrl(url));
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        const delay = Math.max(error.retryAfterMs || 0, attempt * 500);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

async function fetchJson(url) {
  const response = await fetchWithRetries(url);
  return response ? JSON.parse(response.body.toString('utf8')) : null;
}

async function fetchOfficialText(item) {
  const bundlesUrl = itemLinks(item).bundles?.href;
  if (!bundlesUrl) return '';
  const bundles = await fetchJson(bundlesUrl);
  const textBundle = bundles?._embedded?.bundles?.find((bundle) => bundle.name === 'TEXT');
  const bitstreamsUrl = textBundle?._links?.bitstreams?.href;
  if (!bitstreamsUrl) return '';
  const bitstreams = await fetchJson(bitstreamsUrl);
  const candidates = (bitstreams?._embedded?.bitstreams || [])
    .filter((bitstream) => /\.txt$/i.test(bitstream.name || ''))
    .sort((left, right) => left.name.localeCompare(right.name));

  const textParts = [];
  for (const bitstream of candidates) {
    const contentUrl = bitstream._links?.content?.href;
    if (!contentUrl) continue;
    const response = await fetchWithRetries(contentUrl);
    if (response) {
      const text = cleanText(response.body.toString('utf8'));
      if (text) textParts.push(text);
    }
  }
  return textParts.join('\n\n');
}

function createActRecord(item, officialText) {
  const metadata = itemMetadata(item);
  const title = cleanText(firstValue(metadata, 'dc.title')
    || item.name || item._embedded?.indexableObject?.name);
  if (!title) throw new Error(`India Code item ${item.uuid || 'unknown'} has no title.`);

  const itemId = item.uuid || item.id || itemLinks(item).self?.href?.split('/').pop();
  if (!itemId) throw new Error(`India Code item "${title}" has no stable identifier.`);

  const abstract = cleanText(firstValue(metadata, 'dc.description.abstract')
    || firstValue(metadata, 'dc.identifier.preamble_description'));
  const year = Number.parseInt(firstValue(metadata, 'dc.date.act_year'), 10);
  const actNumber = firstValue(metadata, 'dc.identifier.act_number');
  const sourceHandle = firstValue(metadata, 'dc.identifier.uri').match(/(?:handle\/)?(\d+\/\d+)\/?$/)?.[1];
  const sourceUrl = sourceHandle
    ? `https://indiacode.gov.in/handle/${sourceHandle}`
    : `https://indiacode.gov.in/`;
  const preamble = cleanText(firstValue(metadata, 'dc.identifier.preamble_description'));
  const body = officialText || preamble || abstract
    || 'The official text could not be retrieved in a text format. Visit the India Code source page for available files.';
  const ministry = cleanText(firstValue(metadata, 'dc.identifier.ministry_name'));
  const sourceParts = [ministry, actNumber && `Act No. ${actNumber}`, Number.isFinite(year) && `of ${year}`]
    .filter(Boolean);

  return {
    slug: `central-act-${slugify(title)}-${itemId.replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase()}`,
    title,
    category: 'Central Acts',
    excerpt: (abstract || title).slice(0, 400),
    body,
    source: sourceParts.join(', ') || 'India Code — Government of India',
    source_url: sourceUrl,
    record_type: 'central_act',
    source_provider: PROVIDER,
    source_item_id: itemId,
    source_updated_at: parseDate(firstValue(metadata, 'dc.date.last_modified')),
    imported_at: new Date(),
    act_number: actNumber || null,
    act_year: Number.isFinite(year) ? year : null,
    ministry: ministry || null,
    legal_status: cleanText(firstValue(metadata, 'dc.identifier.repealed')) || null,
    official_text_available: Boolean(officialText),
    content_completeness: officialText ? 'full_text' : preamble ? 'preamble' : abstract ? 'abstract' : 'source_link',
    source_metadata: sourceMetadata(item),
  };
}

async function importItem(item, knownRecords, stats) {
  const data = createActRecord(item, '');
  const known = knownRecords.get(data.source_item_id);
  if (known && String(known.source_updated_at || '') === String(data.source_updated_at || '')) {
    stats.skipped += 1;
    return;
  }

  const officialText = await fetchOfficialText(item);
  const record = createActRecord(item, officialText);
  await Material.updateOne(
    { source_provider: PROVIDER, source_item_id: record.source_item_id },
    { $set: record },
    { upsert: true, runValidators: true },
  );
  knownRecords.set(record.source_item_id, record);
  stats.imported += 1;
  if (!record.official_text_available) stats.withoutOfficialText += 1;
}

async function processPage(items, knownRecords, stats) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(WORKERS, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      try {
        await importItem(item, knownRecords, stats);
      } catch (error) {
        stats.failed += 1;
        const detail = error.cause ? `${error.message} (${error.cause.message})` : error.message;
        console.error(`Unable to import India Code item "${item.name || item.uuid || 'unknown'}": ${detail}`);
      }
    }
  });
  await Promise.all(workers);
}

async function performSync() {
  const knownRecords = new Map((await Material.find({ source_provider: PROVIDER })
    .select('source_item_id source_updated_at official_text_available').lean())
    .map((record) => [record.source_item_id, record]));
  const stats = { discovered: 0, imported: 0, skipped: 0, failed: 0, withoutOfficialText: 0 };
  const firstPage = new URL(`${API_ROOT}/discover/search/objects`);
  firstPage.search = new URLSearchParams({
    scope: COLLECTION_ID,
    dsoType: 'item',
    page: '0',
    size: String(PAGE_SIZE),
  }).toString();
  let url = firstPage.href;

  while (url) {
    const response = await fetchJson(url);
    if (!response) throw new Error(`India Code returned no catalogue page: ${url.pathname}`);
    const items = response._embedded?.searchResult?._embedded?.objects
      ?.map((entry) => entry._embedded?.indexableObject)
      .filter(Boolean) || [];
    stats.discovered += items.length;
    const total = response._embedded?.searchResult?.page?.totalElements || stats.discovered;
    await processPage(items, knownRecords, stats);
    console.log(`India Code sync: processed ${stats.discovered}/${total} Acts.`);
    url = paginationLink(response);
  }
  if (stats.failed) {
    throw new Error(`India Code sync completed with ${stats.failed} failed item(s); imported ${stats.imported} of ${stats.discovered}.`);
  }
  console.log(`India Code sync complete: ${JSON.stringify(stats)}`);
  return stats;
}

function syncCentralActs() {
  if (syncInProgress) return syncInProgress;
  syncInProgress = performSync().finally(() => {
    syncInProgress = null;
  });
  return syncInProgress;
}

function scheduleDailySync() {
  if (process.env.NODE_ENV === 'test') return null;
  const timer = setInterval(() => {
    syncCentralActs().catch((error) => console.error('Scheduled India Code sync failed:', error));
  }, 24 * 60 * 60 * 1000);
  timer.unref();
  syncCentralActs().catch((error) => console.error('Initial India Code sync failed:', error));
  return timer;
}

module.exports = {
  PROVIDER,
  createActRecord,
  scheduleDailySync,
  syncCentralActs,
};
