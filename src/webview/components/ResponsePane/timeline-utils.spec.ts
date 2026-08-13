import { describe, test, expect, vi } from 'vitest';

vi.mock('vscode', () => ({}));

const { getItemTimeline } = await import('./timeline-utils');

const inheritingItem = (uid: string) => ({
  uid,
  name: uid,
  type: 'http-request',
  request: { url: 'http://example.com', method: 'GET', auth: { mode: 'inherit' } }
});

const makeCollection = (items: any[], timeline: any[]): any => ({
  uid: 'col-1',
  name: 'Test',
  pathname: '/test',
  items,
  timeline,
  root: { request: { auth: { mode: 'oauth2' } } }
});

describe('getItemTimeline', () => {
  test('returns only entries for the given item, newest first', () => {
    const collection = makeCollection(
      [inheritingItem('req-1'), inheritingItem('req-2')],
      [
        { type: 'request', itemUid: 'req-1', folderUid: null, timestamp: 1, data: {} },
        { type: 'request', itemUid: 'req-2', folderUid: null, timestamp: 2, data: {} },
        { type: 'request', itemUid: 'req-1', folderUid: null, timestamp: 3, data: {} }
      ]
    );

    const result = getItemTimeline(collection, inheritingItem('req-1') as any);

    expect(result.map((e) => e.timestamp)).toEqual([3, 1]);
  });

  test('includes a collection-level oauth2 entry recorded against a sibling request', () => {
    const collection = makeCollection(
      [inheritingItem('req-1'), inheritingItem('req-2')],
      [{ type: 'oauth2', itemUid: 'req-1', folderUid: null, timestamp: 1, data: { debugInfo: [] } }]
    );

    const result = getItemTimeline(collection, inheritingItem('req-2') as any);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('oauth2');
  });

  test('excludes an oauth2 entry when the item does not inherit auth', () => {
    const ownAuthItem = {
      uid: 'req-2',
      name: 'req-2',
      type: 'http-request',
      request: { url: 'http://example.com', method: 'GET', auth: { mode: 'basic' } }
    };
    const collection = makeCollection(
      [inheritingItem('req-1'), ownAuthItem],
      [{ type: 'oauth2', itemUid: 'req-1', folderUid: null, timestamp: 1, data: { debugInfo: [] } }]
    );

    const result = getItemTimeline(collection, ownAuthItem as any);

    expect(result).toHaveLength(0);
  });

  test('returns an empty array when the collection has no timeline', () => {
    expect(getItemTimeline(undefined, inheritingItem('req-1') as any)).toEqual([]);
    expect(getItemTimeline({ uid: 'col-1' } as any, inheritingItem('req-1') as any)).toEqual([]);
  });
});
