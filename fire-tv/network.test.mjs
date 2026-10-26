import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createNetworkHandler} from './network.js';

test('native fetch preserves status/text and rejects local file access', async () => {
  const replies = [], urls = [];
  const handler = createNetworkHandler(r => replies.push(r), async url => {
    urls.push(url);
    return new Response('#EXTM3U\n#EXTINF:-1,Chaîne\nhttps://example.org/live.m3u8');
  });
  await handler.receive(JSON.stringify({type: 'get', id: 1, url: 'https://example.org/playlist'}));
  assert.equal(replies[0].status, 200);
  assert.match(replies[0].body, /Chaîne/);
  await handler.receive(JSON.stringify({type: 'get', id: 2, url: 'file:///data/passwords'}));
  assert.match(replies[1].error, /HTTP/);
  assert.equal(urls.length, 1);
});
test('HTTP failures and malformed messages do not expose credentials', async () => {
  const replies = [];
  const handler = createNetworkHandler(r => replies.push(r), async () => new Response('', {status: 401}));
  await handler.receive('invalid');
  await handler.receive(JSON.stringify({type: 'get', id: 1, url: 'https://example.org/?password=secret'}));
  assert.equal(replies.length, 1);
  assert.ok(replies[0].error);
  assert.ok(!JSON.stringify(replies).includes('secret'));
});
test('response limit rejects oversized declared length', async () => {
  const replies = [];
  const handler = createNetworkHandler(r => replies.push(r), async () => new Response('large', {headers: {'content-length': String(17 * 1024 * 1024)}}));
  await handler.receive(JSON.stringify({type: 'get', id: 1, url: 'https://example.org/'}));
  assert.ok(replies[0].error);
  assert.equal(replies[0].body, undefined);
});
test('overlay removes Samsung APIs and remains repeatable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'canape-vega-'));
  try {
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src/App.tsx'), 'template');
    fs.writeFileSync(path.join(dir, 'manifest.toml'), '[package]\nid = "tv.canape.firetv"\n');
    const prepare = new URL('./prepare.mjs', import.meta.url);
    execFileSync(process.execPath, [prepare.pathname, dir]);
    const first = fs.readFileSync(path.join(dir, 'manifest.toml'), 'utf8');
    execFileSync(process.execPath, [prepare.pathname, dir]);
    assert.equal(first, fs.readFileSync(path.join(dir, 'manifest.toml'), 'utf8'));
    const html = fs.readFileSync(path.join(dir, 'assets/canape/index.html'), 'utf8');
    assert.doesNotMatch(html, /WEBAPIS|tizen.js|avplay.js/);
    assert.ok(html.indexOf('integration.js') < html.indexOf('main.js'));
    assert.ok(html.indexOf('util.js') < html.indexOf('platform.js'));
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
