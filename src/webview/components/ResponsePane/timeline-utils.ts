import { useMemo } from 'react';
import { get } from 'lodash';
import { findItemInCollection, findParentItemInCollection } from 'utils/collections/index';
import type { AppCollection, AppItem } from '@bruno-types';

type ItemTimeline = NonNullable<AppCollection['timeline']>;

const getEffectiveAuthSource = (collection: any, item: any) => {
  const authMode = item.draft ? get(item, 'draft.request.auth.mode') : get(item, 'request.auth.mode');
  if (authMode !== 'inherit') return null;

  const collectionRoot = collection?.draft?.root || collection?.root || {};
  let effectiveSource = {
    type: 'collection',
    uid: collection.uid,
    auth: get(collectionRoot, 'request.auth')
  };

  const path = [];
  let currentItem = findItemInCollection(collection, item?.uid);
  while (currentItem) {
    path.unshift(currentItem);
    currentItem = findParentItemInCollection(collection, currentItem?.uid);
  }

  for (const i of [...path].reverse()) {
    if (i.type === 'folder') {
      const folderAuth = get(i, 'root.request.auth');
      if (folderAuth && folderAuth.mode && folderAuth.mode !== 'none' && folderAuth.mode !== 'inherit') {
        effectiveSource = { type: 'folder', uid: i.uid, auth: folderAuth };
        break;
      }
    }
  }

  return effectiveSource;
};

/**
 * Newest first. Includes OAuth2 entries recorded against an ancestor when this item inherits its
 * auth, so the token calls that produced its credentials are visible. The tab badge and the empty
 * state must use this too, or an inherited-only timeline renders rows the count says are not there.
 */
export const getItemTimeline = (collection: AppCollection | undefined, item: AppItem): ItemTimeline => {
  if (!collection?.timeline?.length) {
    return [];
  }

  const authSource = getEffectiveAuthSource(collection, item);

  return collection.timeline
    .filter((entry) => {
      if (entry.itemUid === item.uid) return true;

      if (entry.type === 'oauth2' && authSource) {
        if (authSource.type === 'folder' && entry.folderUid === authSource.uid) return true;
        if (authSource.type === 'collection' && !entry.folderUid) return true;
      }

      return false;
    })
    .sort((a, b) => b.timestamp - a.timestamp);
};

export const useItemTimeline = (collection: AppCollection | undefined, item: AppItem): ItemTimeline =>
  useMemo(() => getItemTimeline(collection, item), [collection?.timeline, item]);
