// Visits every page of every role at phone and desktop widths and fails on layout problems.
//   1. start the app:  npx vite --port 5199 --strictPort
//   2. run:            node tests/browser/layout-audit.mjs
// Needs Microsoft Edge or Chrome (set BROWSER_PATH to override). Data is a local fake, never a real server.
import {spawn} from 'node:child_process';
const browser = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const base = process.env.APP_URL || 'http://localhost:5199';
const port = 9381, sleep = ms => new Promise(r => setTimeout(r, ms));
const proc = spawn(browser, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${process.env.TEMP || '/tmp'}/layout-audit-profile`, 'about:blank'], {stdio: 'ignore'});
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({id: i, method, params})); });
const run = async expression => (await send('Runtime.evaluate', {expression, returnByValue: true})).result?.result?.value;
await send('Page.enable'); await send('Runtime.enable');
async function open(role, page, width) {
  await send('Emulation.setDeviceMetricsOverride', {width, height: 900, deviceScaleFactor: 1, mobile: width < 600});
  await send('Page.navigate', {url: `${base}/tests/browser/ui-tour.html?role=${role}${page ? `&page=${page}` : ''}`});
  for (let i = 0; i < 60; i++) { await sleep(250); if (await run("document.body.dataset.ready==='1'")) break; }
  await sleep(400);
}
const problems = []; let visited = 0;
for (const width of [390, 1440]) for (const role of ['owner', 'assistant', 'vet', 'admin']) {
  await open(role, '', width);
  for (const key of JSON.parse(await run('JSON.stringify(window.menuKeys())'))) {
    await open(role, key, width); visited++;
    const crashed = await run("!!document.querySelector('.error-boundary, [role=alert] h2')&&document.body.textContent.includes('We couldn’t open this page')");
    if (crashed) problems.push(`${role}:${key} @${width} shows the error page`);
    const sideways = await run('document.documentElement.scrollWidth-document.documentElement.clientWidth');
    if (sideways > 2) problems.push(`${role}:${key} @${width} scrolls sideways by ${sideways}px`);
    if (width < 600 && role === 'owner') {
      const cut = await run("(()=>{const bar=document.querySelector('.ow-tabbar');if(!bar)return 'no tab bar';const last=bar.lastElementChild.getBoundingClientRect(),box=bar.getBoundingClientRect();return last.right>box.right+1||bar.scrollWidth>bar.clientWidth+1?'tab bar is cut off':''})()");
      if (cut) problems.push(`${role}:${key} @${width} ${cut}`);
    }
  }
}
ws.close(); proc.kill();
console.log(`${visited} pages checked at 390px and 1440px.`);
if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
console.log('No layout problems found.');
process.exit(0);
