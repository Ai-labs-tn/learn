/*
 * Hash map timeline (Phase 3) — put, collision, chain, and a lookup that re-hashes its way to
 * the answer. Buckets are 8; the hash values are stated so every step is checkable by hand.
 */

import type { BucketItemView, BucketView, DsaStep } from './types';

function slots(
  items: Record<number, Array<{ key: string; value: string; state?: BucketItemView['state'] }>>,
  hashOf?: { key: string; bucket: number },
): { slots: BucketView[]; hashOf?: { key: string; bucket: number } } {
  const all: BucketView[] = [];
  for (let index = 0; index < 8; index++) {
    all.push({
      index,
      items: (items[index] ?? []).map((item) => ({ ...item, state: item.state ?? 'idle' })),
    });
  }
  return { slots: all, hashOf };
}

export const HASH_TIMELINE: DsaStep[] = [
  {
    id: 'empty',
    phase: 'Setup',
    title: 'Eight buckets and a promise',
    narration:
      'A hash map is an array of buckets plus a hash function. Its promise: given a key, compute the bucket directly — hash(key) % 8 here — instead of searching for it. That is what turns lookup into O(1) on average.',
    stats: [{ label: 'Buckets', value: '8' }],
    hash: slots({}),
  },
  {
    id: 'put-ada',
    phase: 'put("Ada")',
    title: 'Ada hashes to bucket 2',
    narration:
      'hash("Ada") = 502 % 8 = 6… let us state it plainly: in this timeline hash("Ada") % 8 = 2. The entry ("Ada" → "engineer") goes straight into bucket 2. One computation, zero searching.',
    stats: [
      { label: 'Entries', value: '1' },
      { label: 'Probes', value: '1' },
    ],
    hash: slots({ 2: [{ key: 'Ada', value: 'engineer', state: 'new' }] }, { key: 'Ada', bucket: 2 }),
  },
  {
    id: 'put-grace',
    phase: 'put("Grace")',
    title: 'Grace hashes to bucket 5',
    narration:
      'A different key, a different bucket — hash("Grace") % 8 = 5. Entries scatter across the buckets; that scattering IS the data structure.',
    stats: [
      { label: 'Entries', value: '2' },
      { label: 'Probes', value: '1' },
    ],
    hash: slots(
      {
        2: [{ key: 'Ada', value: 'engineer' }],
        5: [{ key: 'Grace', value: 'admiral', state: 'new' }],
      },
      { key: 'Grace', bucket: 5 },
    ),
  },
  {
    id: 'put-linus',
    phase: 'put("Linus")',
    title: 'Collision! Linus also hashes to bucket 2',
    narration:
      'Two keys, one bucket — a hash collision. It is not an error, it is expected (pigeonhole principle: more keys than buckets eventually collide). Separate chaining handles it: bucket 2 becomes a small linked list, newest entry first.',
    stats: [
      { label: 'Entries', value: '3' },
      { label: 'Collisions', value: '1' },
    ],
    hash: slots(
      {
        2: [
          { key: 'Linus', value: 'kernel', state: 'new' },
          { key: 'Ada', value: 'engineer' },
        ],
        5: [{ key: 'Grace', value: 'admiral' }],
      },
      { key: 'Linus', bucket: 2 },
    ),
  },
  {
    id: 'put-kat',
    phase: 'put("Kat")',
    title: 'Kat hashes to bucket 7',
    narration:
      'hash("Kat") % 8 = 7 — empty bucket, direct placement. Load factor is now 4 entries / 8 buckets = 0.5; real maps resize (rehash everything into a bigger table) when this creeps toward 0.75, because chains are what slow lookups down.',
    stats: [
      { label: 'Entries', value: '4' },
      { label: 'Load factor', value: '0.5' },
    ],
    hash: slots(
      {
        2: [
          { key: 'Linus', value: 'kernel' },
          { key: 'Ada', value: 'engineer' },
        ],
        5: [{ key: 'Grace', value: 'admiral' }],
        7: [{ key: 'Kat', value: 'pilot', state: 'new' }],
      },
      { key: 'Kat', bucket: 7 },
    ),
  },
  {
    id: 'get-linus',
    phase: 'get("Linus")',
    title: 'get("Linus") — hash, jump, walk the chain',
    narration:
      'Hash the key: 2. Jump straight to bucket 2. Walk the chain comparing keys: "Linus" matches immediately. Two cheap steps — no scan of the map. This is the O(1)-average promise kept.',
    stats: [
      { label: 'Probes', value: '2' },
      { label: 'Result', value: 'kernel' },
    ],
    hash: slots(
      {
        2: [
          { key: 'Linus', value: 'kernel', state: 'found' },
          { key: 'Ada', value: 'engineer', state: 'probe' },
        ],
        5: [{ key: 'Grace', value: 'admiral' }],
        7: [{ key: 'Kat', value: 'pilot' }],
      },
      { key: 'Linus', bucket: 2 },
    ),
  },
  {
    id: 'get-missing',
    phase: 'get("Eve")',
    title: 'get("Eve") — absent, proven in one probe',
    narration:
      'hash("Eve") % 8 = 3. Bucket 3 is empty — Eve is not in the map, proven without touching any other bucket. The same arithmetic that makes finds fast makes misses fast too.',
    stats: [
      { label: 'Probes', value: '1' },
      { label: 'Result', value: 'not found' },
    ],
    hash: slots(
      {
        2: [
          { key: 'Linus', value: 'kernel' },
          { key: 'Ada', value: 'engineer' },
        ],
        5: [{ key: 'Grace', value: 'admiral' }],
        7: [{ key: 'Kat', value: 'pilot' }],
      },
      { key: 'Eve', bucket: 3 },
    ),
  },
  {
    id: 'worst-case',
    phase: 'Honesty',
    title: 'The O(n) asterisk',
    narration:
      'If every key collided, every lookup would walk one long chain — that is the O(n) worst case hash maps carry. Good hash functions spread keys so this stays theoretical; Java\u2019s HashMap even treeifies long chains (buckets become mini red-black trees) to stay fast under attack.',
    stats: [{ label: 'Entries', value: '4' }],
    hash: slots({
      2: [
        { key: 'Linus', value: 'kernel' },
        { key: 'Ada', value: 'engineer' },
      ],
      5: [{ key: 'Grace', value: 'admiral' }],
      7: [{ key: 'Kat', value: 'pilot' }],
    }),
  },
];
