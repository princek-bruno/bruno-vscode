import fs from 'fs';
import path from 'path';
import { test, expect } from '../fixtures';
import { openBrunoSidebar, createCollection, createFolder, expandFolder, moveItem } from '../utils/actions';

const toPosix = (p: string) => p.split(path.sep).join('/');

/**
 * Regression coverage for the `renderer:move-item` handler
 * (src/extension/ipc/collection.ts): moving a folder used to leave the old
 * folder node behind in the sidebar because the VS Code file watcher only
 * watches file globs and never emits `unlinkDir` for the removed directory.
 * The stale node then blocked reverting the move. The handler now broadcasts
 * `unlinkDir` for the source directory, so the tree stays consistent whether
 * moving in or reverting back out.
 *
 * Each sidebar item row renders only its own name plus one `.indent-block` per
 * tree depth, so the set of indent depths for the "Alpha" rows pins down both
 * how many Alpha folders exist and where they sit: a lingering stale node shows
 * up as an extra Alpha at the wrong depth.
 */
test.describe('drag & drop folder move', () => {
  test('removes the stale source folder on move and on revert', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);

    const collectionName = 'DnDCollection';
    await createCollection(page, sidebar, collectionName, tmpDir);

    await createFolder(sidebar, collectionName, 'Alpha');
    await createFolder(sidebar, collectionName, 'Beta');

    // The collection is created on disk as <tmpDir>/<sanitized name> — discover
    // it rather than assuming the sanitized folder name.
    const collectionDirName = fs
      .readdirSync(tmpDir, { withFileTypes: true })
      .find((e) => e.isDirectory())?.name;
    expect(collectionDirName, 'collection directory should exist on disk').toBeTruthy();
    const collectionDir = path.join(tmpDir, collectionDirName as string);

    const alphaAtRoot = path.join(collectionDir, 'Alpha');
    const betaDir = path.join(collectionDir, 'Beta');
    const alphaInsideBeta = path.join(betaDir, 'Alpha');

    // Depths of every "Alpha" folder row currently in the tree, sorted.
    const alphaDepths = () =>
      sidebar
        .locator('[data-testid="sidebar-collection-item-row"]')
        .filter({ hasText: 'Alpha' })
        .evaluateAll((els) => els.map((el) => el.querySelectorAll('.indent-block').length).sort());

    // Baseline: a single Alpha folder at the collection root (depth 1).
    await expect.poll(alphaDepths).toEqual([1]);

    // Move Alpha into Beta, then expand Beta so its child renders. Alpha must
    // end up as a single node nested under Beta (depth 2) — the stale root-level
    // node (depth 1) must be gone. Without the fix this settles at [1, 2].
    await moveItem(sidebar, { sourcePathname: toPosix(alphaAtRoot), targetDirname: toPosix(betaDir) });
    await expandFolder(sidebar, 'Beta');
    await expect.poll(alphaDepths, { timeout: 15_000 }).toEqual([2]);

    // Revert: move Alpha back out to the collection root. It must return to a
    // single root-level node (depth 1) with no stale copy left under Beta.
    // Without the fix this settles at [1, 2].
    await moveItem(sidebar, { sourcePathname: toPosix(alphaInsideBeta), targetDirname: toPosix(collectionDir) });
    await expect.poll(alphaDepths, { timeout: 15_000 }).toEqual([1]);
  });
});
