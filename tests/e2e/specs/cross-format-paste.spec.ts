import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '../fixtures';
import {
  openBrunoSidebar,
  createCollection,
  openNewRequestPanel,
  createRequest,
  openRequest,
  copyItem,
  pasteIntoCollection,
  expandCollection,
  collapseCollection,
} from '../utils/actions';

const TEST_SERVER = 'http://127.0.0.1:8081';

// Recursively collect every file under `dir`.
function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

// Regression test for the cross-format paste crash: copying a request out of a
// `.bru` collection and pasting it into a `.yml` (OpenCollection) collection
// used to serialize the request in the SOURCE format while naming the file with
// the DESTINATION extension. The resulting `.yml` file held `.bru` syntax; the
// watcher couldn't parse it, produced a partial item with no `request`, and the
// sidebar crashed rendering the method badge — persisting across reloads.
test.describe('Cross-format paste', () => {

  test('paste a request from a .bru collection into a .yml collection', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);

    const sourceCollection = 'Bru Source';
    const targetCollection = 'Yml Target';
    const requestName = 'Ping';
    const requestUrl = `${TEST_SERVER}/ping`;

    // Two collections of different on-disk formats.
    await createCollection(page, sidebar, sourceCollection, tmpDir, 'bru');
    await createCollection(page, sidebar, targetCollection, tmpDir, 'yml');

    // A request in the .bru source collection.
    const newReqPanel = await openNewRequestPanel(page, sidebar, sourceCollection);
    await createRequest(page, newReqPanel, sidebar, sourceCollection, requestName, requestUrl, 'POST');

    // Copy it, then paste into the .yml target collection.
    await copyItem(sidebar, requestName);
    await pasteIntoCollection(sidebar, targetCollection);

    // The sidebar must survive the paste: both collection rows remain visible.
    // (A crash unmounts the tree, so these vanish.)
    await expect(sidebar.locator('.sidebar-header')).toBeVisible();
    await expect(
      sidebar.locator('[data-testid="sidebar-collection-row"]').filter({ hasText: sourceCollection })
    ).toBeVisible();
    await expect(
      sidebar.locator('[data-testid="sidebar-collection-row"]').filter({ hasText: targetCollection })
    ).toBeVisible();

    // The pasted request renders in the target collection tree.
    await expandCollection(sidebar, targetCollection);
    await expect(
      sidebar
        .locator('[data-testid="sidebar-collection-item-row"]')
        .filter({ hasText: requestName })
    ).toBeVisible({ timeout: 15_000 });

    // The definitive check: the pasted request file must be written in the
    // DESTINATION format. It lives in a folder identified by the target's
    // opencollection.yml; the request itself is a `.yml` file next to it.
    const ocConfig = walkFiles(tmpDir).find((f) => path.basename(f) === 'opencollection.yml');
    expect(ocConfig, 'target collection opencollection.yml should exist').toBeTruthy();
    const targetDir = path.dirname(ocConfig as string);
    const pastedFile = fs
      .readdirSync(targetDir)
      .find((name) => name.toLowerCase().endsWith('.yml') && name !== 'opencollection.yml');
    expect(pastedFile, 'pasted request .yml file should exist in the target collection').toBeTruthy();

    const pastedContent = fs.readFileSync(path.join(targetDir, pastedFile as string), 'utf8');
    // OpenCollection (yml) requests start with an `info:` block. A `.bru`-format
    // body (the bug) would instead contain a `meta {` block.
    expect(pastedContent).toContain('info:');
    expect(pastedContent).not.toContain('meta {');

    // And it opens cleanly with the request data preserved across the
    // conversion. Collapse the source first so the identically named source
    // request is out of the DOM and we unambiguously open the pasted one.
    await collapseCollection(sidebar, sourceCollection);
    const editor = await openRequest(page, sidebar, targetCollection, requestName);
    await expect(editor.locator('#request-url')).toContainText(requestUrl, { timeout: 10_000 });
  });
});
