import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PlatPricesPriceProvider,
  NintendoPriceProvider,
  XboxPriceProvider,
} from '../dist/modules/integrations/pricing/store-price.provider.js';

const fixtures = await Promise.all(
  ['platprices', 'ntprices'].map(async (name) =>
    JSON.parse(
      await readFile(new URL(`./fixtures/pricing/${name}-v2.json`, import.meta.url), 'utf8'),
    ),
  ),
);
const now = new Date('2026-09-19T03:00:00Z');
const game = {
  id: 'fixture',
  title: 'Fixture Adventure',
  slug: 'fixture-adventure',
  publisher: 'Fixture Studio',
  releaseDate: new Date('2025-02-04'),
  platforms: [],
};
const key = 'secret-for-tests-never-log';

for (const [index, Provider, store, platform, idField] of [
  [0, PlatPricesPriceProvider, 'PLAYSTATION', 'PlayStation', 'PSNID'],
  [1, NintendoPriceProvider, 'NINTENDO', 'Switch', 'NSUID'],
]) {
  function setup(change = () => {}, responseOverride) {
    const body = structuredClone(fixtures[index]);
    change(body);
    const requests = [];
    const provider = new Provider({
      apiKey: key,
      now: () => now,
      fetcher: async (url, options) => {
        requests.push({ url: new URL(url), options });
        if (responseOverride) return responseOverride(url, options);
        const data = url.pathname.endsWith('/regions')
          ? { success: true, data: [{ region: 'BR', decimalPlaces: 2, inYourPlan: true }] }
          : url.pathname.includes('/by-')
            ? { ...body, data: body.data[0] }
            : body;
        return Response.json(data);
      },
    });
    return { provider, requests, input: { ...game, platforms: [platform] } };
  }

  test(`${store}: real v2 contract, BRL minor units and X-API-Key`, async () => {
    const { provider, input, requests } = setup();
    const [offer] = await provider.fetchOffers(input);
    assert.equal(offer.store, store);
    assert.equal(offer.provider, index === 0 ? 'PLATPRICES' : 'NTPRICES');
    assert.equal(offer.currency, 'BRL');
    assert.equal(offer.region, 'BR');
    assert.equal(offer.originalPriceCents, 29990);
    assert.equal(offer.finalPriceCents, 29990); // Never use PlusPrice as general price.
    assert.equal(offer.discountPercent, 0);
    assert.equal(offer.isAvailable, true);
    assert.equal(offer.observedAt, now);
    assert.equal(offer.externalProductId, fixtures[index].data[0][idField]);
    assert.equal(requests[1].url.pathname, '/api/v2/games/search');
    assert.equal(requests[1].url.searchParams.get('region'), 'br');
    assert.equal(requests[1].url.searchParams.get('include_dlc'), '0');
    for (const request of requests) {
      assert.equal(request.options.headers['X-API-Key'], key);
      assert.equal(request.options.redirect, 'error');
      assert.equal(String(request.url).includes(key), false);
    }
    await provider.fetchOffers(input);
    assert.equal(requests.filter((r) => r.url.pathname.endsWith('/regions')).length, 1);
  });

  test(`${store}: promotion preserves exact final/base prices and discount`, async () => {
    const { provider, input } = setup((body) =>
      Object.assign(body.data[0], { SalePrice: 14995, DiscPerc: 50 }),
    );
    const [offer] = await provider.fetchOffers(input);
    assert.equal(offer.finalPriceCents, 14995);
    assert.equal(offer.originalPriceCents, 29990);
    assert.equal(offer.discountPercent, 50);
  });

  for (const [label, patch] of [
    ['DLC', { IsDLC: 1 }],
    ['demo', { IsDemoOrSoundtrack: 1 }],
    ['bundle', { ProductName: 'Fixture Adventure Bundle' }],
    ['Deluxe instead of Standard', { EditionName: 'Deluxe Edition' }],
    ['contradictory edition type', { EditionName: 'Standard Edition', EditionType: 'DELUXE' }],
    ['non-base product', { StoreClass: 'ADD_ON' }],
    ['publisher mismatch', { Publisher: 'Another Company' }],
    ['release mismatch', { ReleaseDate: '2010-01-01' }],
    ['unknown release sentinel', { ReleaseDate: '2000-01-01' }],
    ['missing base flag', { IsDLC: null }],
    ['foreign region', { region: 'US' }],
    ['foreign currency', { PriceCurrency: 'USD' }],
    ['missing price', { SalePrice: null }],
    ['negative price', { SalePrice: -1 }],
    ['fractional cents', { SalePrice: 19.99 }],
    ['invalid discount', { DiscPerc: 101 }],
    ['missing availability', { IsDelisted: null }],
  ]) {
    test(`${store}: rejects ${label}`, async () => {
      const { provider, input } = setup((body) => Object.assign(body.data[0], patch));
      assert.deepEqual(await provider.fetchOffers(input), []);
    });
  }

  test(`${store}: select correct edition even when wrong result comes first`, async () => {
    const { provider, input } = setup((body) => {
      body.data.unshift({ ...body.data[0], [idField]: 'wrong', EditionName: 'Deluxe Edition' });
      body.meta.count = 2;
    });
    assert.equal(
      (await provider.fetchOffers(input))[0].externalProductId,
      fixtures[index].data[0][idField],
    );
  });
  test(`${store}: rejects ambiguous and truncated search`, async () => {
    const ambiguous = setup((body) => {
      body.data.push({ ...body.data[0], [idField]: 'another-product' });
      body.meta.count = 2;
    });
    assert.deepEqual(await ambiguous.provider.fetchOffers(ambiguous.input), []);
    const truncated = setup((body) => {
      body.meta.count = 2;
    });
    assert.deepEqual(await truncated.provider.fetchOffers(truncated.input), []);
  });
  test(`${store}: known product ID uses identity endpoint, rejects returned ID mismatch`, async () => {
    const { provider, input, requests } = setup();
    input.productIds = { [store]: fixtures[index].data[0][idField] };
    input.publisher = null;
    assert.equal((await provider.fetchOffers(input)).length, 1);
    assert.match(requests[1].url.pathname, new RegExp(`/by-${index === 0 ? 'psnid' : 'nsuid'}/`));
    input.productIds = { [store]: 'wrong' };
    assert.deepEqual(await provider.fetchOffers(input), []);
  });
  test(`${store}: delisted product clears price rather than fabricating zero`, async () => {
    const { provider, input } = setup((body) =>
      Object.assign(body.data[0], { IsDelisted: 1, SalePrice: -1 }),
    );
    const [offer] = await provider.fetchOffers(input);
    assert.equal(offer.isAvailable, false);
    assert.equal(offer.finalPriceCents, null);
  });
  test(`${store}: no key never fetches, including dev-fixture mode`, async () => {
    const old = process.env.NEXTPLAY_DEV_FIXTURES;
    process.env.NEXTPLAY_DEV_FIXTURES = 'true';
    try {
      const provider = new Provider({
        apiKey: '',
        fetcher: async () => {
          throw Error('must not fetch');
        },
      });
      assert.equal(provider.isConfigured(), false);
      assert.deepEqual(await provider.fetchOffers({ ...game, platforms: [platform] }), []);
    } finally {
      if (old === undefined) delete process.env.NEXTPLAY_DEV_FIXTURES;
      else process.env.NEXTPLAY_DEV_FIXTURES = old;
    }
  });
  test(`${store}: irrelevant platform makes no external call`, async () => {
    const { provider, input, requests } = setup();
    assert.deepEqual(await provider.fetchOffers({ ...input, platforms: ['Xbox'] }), []);
    assert.equal(requests.length, 0);
  });
  for (const status of [401, 403, 429, 503]) {
    test(`${store}: HTTP ${status} is safe, no retry storm or secret disclosure`, async () => {
      const { provider, input, requests } = setup(undefined, () =>
        Response.json({ error: { message: key } }, { status, headers: { 'Retry-After': '60' } }),
      );
      await assert.rejects(provider.fetchOffers(input), (error) => {
        assert.equal(error.status, status);
        assert.equal(error.message.includes(key), false);
        return true;
      });
      assert.equal(requests.length, 1);
    });
  }
  test(`${store}: network errors and malformed JSON never expose secrets`, async () => {
    for (const response of [
      () => {
        throw Error(key);
      },
      () => new Response('{bad'),
    ]) {
      const { provider, input } = setup(undefined, response);
      await assert.rejects(provider.fetchOffers(input), (error) => !error.message.includes(key));
    }
  });
  test(`${store}: region outside plan blocks offers`, async () => {
    const { provider, input } = setup(undefined, () =>
      Response.json({
        success: true,
        data: [{ region: 'BR', decimalPlaces: 2, inYourPlan: false }],
      }),
    );
    await assert.rejects(provider.fetchOffers(input), /BR_REGION_UNAVAILABLE/);
  });
  test(`${store}: search and foreign product URLs are rejected`, async () => {
    for (const url of [
      'https://example.com/product/test',
      'https://store.playstation.com/pt-br/search/Fixture',
    ]) {
      const { provider, input } = setup((body) => {
        body.data[0][index === 0 ? 'PSStoreURL' : 'eShopURL'] = url;
      });
      assert.deepEqual(await provider.fetchOffers(input), []);
    }
  });
  if (index === 1)
    test('Nintendo: Switch 2 flags supported; wrong generation rejected', async () => {
      const { provider, input } = setup((body) =>
        Object.assign(body.data[0], { IsSwitch: 0, IsSwitch2: 1 }),
      );
      assert.equal(
        (await provider.fetchOffers({ ...input, platforms: ['Nintendo Switch 2'] })).length,
        1,
      );
      const base = setup();
      assert.deepEqual(
        await base.provider.fetchOffers({ ...base.input, platforms: ['Switch 2'] }),
        [],
      );
    });
}

test('Xbox remains inactive and returns no invented offer', async () => {
  const provider = new XboxPriceProvider();
  assert.equal(provider.isConfigured(), false);
  assert.deepEqual(await provider.fetchOffers(game), []);
});
