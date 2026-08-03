import * as fs from 'fs';
import * as path from 'path';
import type { Page, Frame } from '@playwright/test';
import { test, expect } from '../utils/fixtures';
import { openBrunoSidebar, createCollection, openRequest, openRequestPaneTab, findCollectionDir } from '../utils/page/actions';
import { getActiveEditorFrame } from '../utils/page/oauth2-actions';

// A request with a typed (object) pre-request var, a plain string pre-request var,
// and a post-response var (which holds a JS expression, so it must NOT get a type).
const TYPED_REQUEST_BRU = [
  'meta {', '  name: Typed', '  type: http', '  seq: 1', '}', '',
  'get {', '  url: https://usebruno.com', '  body: none', '  auth: inherit', '}', '',
  'vars:pre-request {', '  @object', '  cfg: {"host":"localhost"}', '  token: abc123', '}', '',
  'vars:post-response {', '  saved: res.body.token', '}', ''
].join('\n');

async function openTypedVars(page: Page, tmpDir: string): Promise<Frame> {
  const sidebar = await openBrunoSidebar(page);
  const collectionName = 'Typed Vars';
  await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

  const collectionDir = findCollectionDir(tmpDir);
  fs.writeFileSync(path.join(collectionDir, 'Typed.bru'), TYPED_REQUEST_BRU, 'utf8');

  const opened = await openRequest(page, sidebar, collectionName, 'Typed');
  // Re-acquire the editor frame (opening can replace the webview) before driving its tabs.
  const editor = await getActiveEditorFrame(page, opened);
  await openRequestPaneTab(editor, 'Vars');
  return editor;
}

// One VS Code launch, every acceptance criterion checked in sequence — launching a fresh
// instance per assertion is slow and flaky, so this stays a single test.
test.describe('Data types in request variables', () => {
  test('display, per-scope selector, dropdown options and type selection all work', async ({ page, tmpDir }) => {
    const editor = await openTypedVars(page, tmpDir);

    const reqTable = editor.locator('[data-testid="request-vars-req"]');
    await expect(reqTable).toBeVisible({ timeout: 15_000 });

    // The @object var round-trips from disk and renders as JSON, never "[object Object]".
    await expect(reqTable).toContainText('{"host":"localhost"}');
    await expect(reqTable).not.toContainText('[object Object]');

    // The type selector reflects the parsed data type per row.
    const cfgSelector = editor.locator('[data-testid="datatype-selector-cfg"]');
    const tokenSelector = editor.locator('[data-testid="datatype-selector-token"]');
    await expect(cfgSelector).toContainText('object');
    await expect(tokenSelector).toContainText('string');

    // Post-response vars hold a JS expression, so no data-type selector is offered.
    const resTable = editor.locator('[data-testid="request-vars-res"]');
    await expect(resTable).toBeVisible();
    await expect(resTable.locator('[data-testid^="datatype-selector-"]')).toHaveCount(0);

    // The dropdown is portaled to the body, so every option is reachable/visible even
    // though it opens over the last row / table edge.
    await tokenSelector.click();
    for (const type of ['string', 'number', 'boolean', 'object']) {
      await expect(editor.locator(`[data-testid="datatype-selector-token-${type}"]`)).toBeVisible();
    }

    // Choosing a type applies it in the UI and persists to disk on save (Cmd/Ctrl+S).
    const requestFile = path.join(findCollectionDir(tmpDir), 'Typed.bru');
    await editor.locator('[data-testid="datatype-selector-token-number"]').click();
    await expect(tokenSelector).toContainText('number');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+S' : 'Control+S');
    await expect.poll(() => fs.readFileSync(requestFile, 'utf8'), { timeout: 15_000 }).toContain('@number');

    // Reverting to the implicit 'string' default drops the annotation on disk.
    await tokenSelector.click();
    await editor.locator('[data-testid="datatype-selector-token-string"]').click();
    await expect(tokenSelector).toContainText('string');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+S' : 'Control+S');
    await expect.poll(() => fs.readFileSync(requestFile, 'utf8'), { timeout: 15_000 }).not.toContain('@number');
    // The object var's annotation is untouched throughout.
    expect(fs.readFileSync(requestFile, 'utf8')).toContain('@object');
  });
});
