import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foodSearcher } from '../foodsearch';

// A stand-in for the two databases: made-up answers, counted calls, no network.
function fakeFetch() {
  const calls: string[] = [];
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const fn = (async (url: string) => {
    calls.push(url);
    if (url.includes('/api/v2/product/')) return json({ status: 1, product: { code: '7318690058274', product_name: 'Honung', brands: 'ICA', nutriments: { 'energy-kcal_100g': 320, proteins_100g: 0, carbohydrates_100g: 79, fat_100g: 0 } } });
    if (url.includes('/cgi/search.pl')) return json({ products: [{ code: '1', product_name: 'Banan chips', nutriments: { 'energy-kcal_100g': 520, proteins_100g: 2, carbohydrates_100g: 58, fat_100g: 30 } }, { code: '2', product_name: 'No numbers' }] });
    if (url.endsWith('/naringsvarden?sprak=1')) return json([{ euroFIRkod: 'ENERC', enhet: 'kcal', varde: 88 }, { euroFIRkod: 'PROT', varde: 1.1 }, { euroFIRkod: 'CHO', varde: 20 }, { euroFIRkod: 'FAT', varde: 0.2 }]);
    if (url.includes('/livsmedel?')) return json({ livsmedel: [{ nummer: 7, namn: 'Bananchips friterade' }, { nummer: 8, namn: 'Banan' }, { nummer: 9, namn: 'Äpple' }] });
    return new Response('', { status: 404 });
  }) as typeof fetch;
  return { fn, calls };
}

test('a barcode is looked up once, then kept', async () => {
  const f = fakeFetch();
  const s = foodSearcher(f.fn);
  assert.equal((await s.barcode('7318690058274'))?.name, 'Honung');
  await s.search('7318690058274');
  assert.equal(f.calls.length, 1);
});

test('a name searches both; plain names first, products without numbers left out', async () => {
  const f = fakeFetch();
  const s = foodSearcher(f.fn);
  const r = await s.search('banan');
  assert.deepEqual(r.off.map((m) => m.name), ['Banan chips']);
  assert.deepEqual(r.slv.map((m) => m.name), ['Banan', 'Bananchips friterade']);
  const before = f.calls.length;
  await s.search('Banan');
  assert.equal(f.calls.length, before, 'the same search again comes from what was kept');
});

test('one database down leaves the other', async () => {
  const f = fakeFetch();
  const s = foodSearcher((async (url: string, init?: RequestInit) => (url.includes('openfoodfacts') ? new Response('', { status: 503 }) : f.fn(url, init))) as typeof fetch);
  const r = await s.search('äpple');
  assert.equal(r.off.length, 0);
  assert.deepEqual(r.slv.map((m) => m.name), ['Äpple']);
});
