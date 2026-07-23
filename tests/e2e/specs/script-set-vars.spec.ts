import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '../fixtures';
import { openBrunoSidebar, createCollection, openRequest, sendRequest } from '../utils/actions';

const TEST_SERVER = 'http://127.0.0.1:8081';

// Find the collection directory created under tmpDir (the folder containing bruno.json).
function findCollectionDir(root: string): string {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop() as string;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    if (entries.some((e) => e.isFile() && e.name === 'bruno.json')) return dir;
    for (const e of entries) {
      if (e.isDirectory()) stack.push(path.join(dir, e.name));
    }
  }
  throw new Error(`No collection (bruno.json) found under ${root}`);
}

test.describe('Scripting: variable APIs', () => {
  test('a pre-request script (bru.setVar) runs and its variable interpolates into the outgoing request', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Script Vars';

    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

    // Write a request whose pre-request script sets `token`, used in a header echoed by the mock server.
    const collectionDir = findCollectionDir(tmpDir);
    const requestBru = [
      'meta {',
      '  name: Ping',
      '  type: http',
      '  seq: 1',
      '}',
      '',
      'get {',
      `  url: ${TEST_SERVER}/capture`,
      '  body: none',
      '  auth: inherit',
      '}',
      '',
      'headers {',
      '  x-token: {{token}}',
      '}',
      '',
      'script:pre-request {',
      "  bru.setVar('token', 'ABC123');",
      '}',
      ''
    ].join('\n');
    fs.writeFileSync(path.join(collectionDir, 'Ping.bru'), requestBru, 'utf8');

    const editor = await openRequest(page, sidebar, collectionName, 'Ping');
    await sendRequest(editor, 200);

    // Ground truth: query the mock server (from Node) for the header the extension actually sent.
    // If the script ran and `{{token}}` interpolated, this is 'ABC123'; if the script never ran (the
    // sandbox failed to initialize), it is the literal '{{token}}'.
    const res = await fetch(`${TEST_SERVER}/last-capture`);
    const { token } = (await res.json()) as { token: string | null };
    expect(token).toBe('ABC123');
  });
});
