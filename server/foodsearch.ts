import { isBarcode, matches, normalize, readOffProduct, readSlvNutrients, type FoodMatch } from '../src/pipeline/foodSearch';

/**
 * The server's side of food search (src/pipeline/foodSearch.ts): it asks Open Food Facts and
 * Livsmedelsverket, which the browser can't reach for us, and keeps what it got for a while so
 * a search typed twice, or a barcode scanned every morning, doesn't ask again.
 *
 * Open Food Facts (openfoodfacts.org, ODbL): packaged food by barcode or name. It asks callers to
 * name themselves in the User-Agent and to keep searches to a few a minute.
 * Livsmedelsverket (dataportal.livsmedelsverket.se, CC BY 4.0): about 2,600 plain foods. It has
 * no search, so the list of names is fetched once a week and searched here; the nutrient values
 * are fetched only for the foods found, and kept.
 */

const UA = 'HealthierFork/1.0 (private health dashboard; github.com/quark733/healthier)';
const OFF = 'https://world.openfoodfacts.org';
const SLV = 'https://dataportal.livsmedelsverket.se/livsmedel/api/v1';
const DAY = 24 * 60 * 60 * 1000;

type Fetch = typeof fetch;

export interface FoodSearcher {
  barcode(code: string): Promise<FoodMatch | null>;
  search(query: string): Promise<{ off: FoodMatch[]; slv: FoodMatch[] }>;
}

export function foodSearcher(fetchFn: Fetch = fetch, now: () => number = Date.now): FoodSearcher {
  const getJson = async (url: string): Promise<unknown> => {
    const r = await fetchFn(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`${url.split('?')[0]}: HTTP ${r.status}`);
    return r.json();
  };

  const barcodes = new Map<string, { at: number; match: FoodMatch | null }>();
  const searches = new Map<string, { at: number; list: FoodMatch[] }>();
  let slvList: { at: number; foods: { nummer: string; namn: string }[] } | null = null;
  const slvValues = new Map<string, FoodMatch | null>();

  async function barcode(code: string): Promise<FoodMatch | null> {
    const c = code.trim();
    if (!isBarcode(c)) return null;
    const had = barcodes.get(c);
    if (had && now() - had.at < 7 * DAY) return had.match;
    const j = (await getJson(`${OFF}/api/v2/product/${c}?fields=code,product_name,product_name_sv,generic_name,brands,nutriments`)) as any;
    const match = j?.status === 1 ? readOffProduct({ ...j.product, code: j.product?.code ?? c }) : null;
    barcodes.set(c, { at: now(), match });
    return match;
  }

  async function searchOff(q: string): Promise<FoodMatch[]> {
    const key = normalize(q);
    const had = searches.get(key);
    if (had && now() - had.at < DAY) return had.list;
    const params = new URLSearchParams({
      search_terms: q,
      search_simple: '1',
      action: 'process',
      json: '1',
      page_size: '15',
      fields: 'code,product_name,product_name_sv,generic_name,brands,nutriments',
      tagtype_0: 'countries',
      tag_contains_0: 'contains',
      tag_0: 'sweden',
    });
    const j = (await getJson(`${OFF}/cgi/search.pl?${params}`)) as any;
    const list = (Array.isArray(j?.products) ? j.products : []).map(readOffProduct).filter((m: FoodMatch | null): m is FoodMatch => m !== null).slice(0, 8);
    searches.set(key, { at: now(), list });
    return list;
  }

  async function searchSlv(q: string): Promise<FoodMatch[]> {
    if (!slvList || now() - slvList.at > 7 * DAY) {
      const j = (await getJson(`${SLV}/livsmedel?offset=0&limit=5000&sprak=1`)) as any;
      const foods = (Array.isArray(j?.livsmedel) ? j.livsmedel : [])
        .map((f: any) => ({ nummer: String(f?.nummer ?? ''), namn: String(f?.namn ?? '') }))
        .filter((f: { nummer: string; namn: string }) => f.nummer && f.namn);
      slvList = { at: now(), foods };
    }
    const nq = normalize(q);
    const found = slvList.foods
      .filter((f) => matches(f.namn, q))
      // Shorter names first: "Banan" before "Bananchips friterade".
      .sort((a, b) => Number(normalize(b.namn).startsWith(nq)) - Number(normalize(a.namn).startsWith(nq)) || a.namn.length - b.namn.length)
      .slice(0, 6);
    const out = await Promise.all(
      found.map(async (f) => {
        if (slvValues.has(f.nummer)) return slvValues.get(f.nummer)!;
        const per100 = readSlvNutrients(await getJson(`${SLV}/livsmedel/${encodeURIComponent(f.nummer)}/naringsvarden?sprak=1`));
        const m: FoodMatch | null = per100 ? { source: 'slv', id: f.nummer, name: f.namn, brand: null, per100 } : null;
        slvValues.set(f.nummer, m);
        return m;
      }),
    );
    return out.filter((m): m is FoodMatch => m !== null);
  }

  async function search(query: string): Promise<{ off: FoodMatch[]; slv: FoodMatch[] }> {
    const q = query.trim().slice(0, 80);
    if (q.length < 2) return { off: [], slv: [] };
    if (isBarcode(q)) {
      const m = await barcode(q);
      return { off: m ? [m] : [], slv: [] };
    }
    // One source failing (down, slow) leaves the other's answers.
    const [off, slv] = await Promise.allSettled([searchOff(q), searchSlv(q)]);
    if (off.status === 'rejected') console.error('Open Food Facts search failed:', off.reason);
    if (slv.status === 'rejected') console.error('Livsmedelsverket search failed:', slv.reason);
    return { off: off.status === 'fulfilled' ? off.value : [], slv: slv.status === 'fulfilled' ? slv.value : [] };
  }

  return { barcode, search };
}

let shared: FoodSearcher | null = null;
/** One searcher for the process, so the API and MCP share what's been fetched. */
export function sharedFoodSearcher(): FoodSearcher {
  shared ??= foodSearcher();
  return shared;
}
