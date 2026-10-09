// Word for This Moment — sends the daily word each morning.
// Runs on GitHub Actions (free). It reads the verses straight from index.html,
// picks today's word, and sends it to every channel that has been set up.
// Channels switch on only when their secrets exist, so you can add them one at a time.
import { readFile } from 'node:fs/promises';

const SITE = 'https://koredeoyewoga.github.io/word-for-this-moment/';
const env = process.env;
const DRY = env.DRY_RUN === '1';

// ---------- 1. Only send once, at 7am UK time (handles summer/winter time) ----------
function londonOffsetHours(d = new Date()) {
  const s = d.toLocaleString('en-GB', { timeZone: 'Europe/London', timeZoneName: 'short' });
  return /BST/.test(s) ? 1 : 0;
}
const trigger = env.SCHEDULE || '';            // which cron fired (empty when run by hand)
if (trigger) {
  const wanted = londonOffsetHours() === 1 ? '0 6 * * *' : '0 7 * * *';
  if (trigger !== wanted) { console.log(`Skipping: this run (${trigger}) is not 7am UK time today.`); process.exit(0); }
}

// ---------- 2. Load verses from the app ----------
const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const grab = name => { const i = html.indexOf(`const ${name}=`) + name.length + 7; return JSON.parse(html.slice(i, html.indexOf(';\n', i))); };
const DATA = grab('DATA');
const topics = DATA.flatMap(g => g.items);

// Gentle, general themes only — never crisis topics — for a morning message.
const DAILY = ['peace','love','gratitude','strength','guidance','faith','newbeginnings','protection','purpose','waiting','mercy','anxiety','fear','provision','favour','breakthrough','doors','lonely','far','healing','trials'];
const pool = [];
for (const id of DAILY) { const t = topics.find(x => x.id === id); if (!t) continue;
  t.verses.slice(0, 4).forEach(v => { if (/^[“"‘A-Z]/.test(v.text) && v.text.length < 330 && !/money|enemies|vengeance/i.test(v.text)) pool.push({ v, t }); }); }
// Shuffle once with a fixed seed so consecutive days come from different themes.
let seed = 20261009; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
const now = env.TEST_DATE ? new Date(env.TEST_DATE + 'T07:00:00Z') : new Date();   // TEST_DATE lets you preview another day
const today = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
const dayNo = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000);
const { v, t } = pool[dayNo % pool.length];
const link = SITE + '#' + t.id;
const declaration = t.declarations[0];
const dateText = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
console.log(`Today's word (${dateText}): ${v.ref} — ${t.name}\n${v.text}\n${link}`);

// ---------- 3. Send ----------
const results = [];
async function send(name, fn) {
  try { if (DRY) { console.log(`[dry run] would send ${name}`); results.push(`${name}: dry run`); return; }
        await fn(); results.push(`${name}: sent`); }
  catch (e) { results.push(`${name}: FAILED – ${e.message}`); }
}
async function post(url, headers, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const text = await r.text(); if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 300)}`); return text ? JSON.parse(text) : {};
}
// Plain characters keep each text to the cheaper 160-character size.
const plain = s => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[—–]/g, '-').replace(/…/g, '...').replace(/[^\x20-\x7E]/g, '');
const short = (s, n) => s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s;

// App notifications (OneSignal)
if (env.ONESIGNAL_APP_ID && env.ONESIGNAL_API_KEY) await send('App notification', () =>
  post('https://api.onesignal.com/notifications?c=push', { Authorization: `Key ${env.ONESIGNAL_API_KEY}` }, {
    app_id: env.ONESIGNAL_APP_ID, included_segments: ['Total Subscriptions'], isAnyWeb: true,
    headings: { en: `Today’s word · ${v.ref}` }, contents: { en: short(v.text, 170) }, url: link }));

// Telegram channel
if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) await send('Telegram', () =>
  post(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {}, {
    chat_id: env.TELEGRAM_CHAT_ID, disable_web_page_preview: true,
    text: `📖 Today’s word — ${dateText}\n\n“${v.text}”\n— ${v.ref} (WEB)\n\n🙏 Declare it: ${declaration}\n\nRead, listen and pray: ${link}` }));

// Email (Brevo) — sent to your Brevo contact list
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
if (env.BREVO_API_KEY && env.BREVO_LIST_ID && env.BREVO_SENDER_EMAIL) await send('Email', async () => {
  const htmlContent = `<!doctype html><html><body style="margin:0;background:#F7F5EF;font-family:Georgia,serif;color:#202B28">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
   <p style="font-family:Arial,sans-serif;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#53605B;margin:0 0 6px">${esc(dateText)}</p>
   <h1 style="font-size:26px;margin:0 0 20px;color:#173F35">Today’s word</h1>
   <div style="background:#173F35;color:#F7F5EF;border-radius:16px;padding:24px">
    <p style="font-size:21px;line-height:1.55;margin:0 0 14px">“${esc(v.text)}”</p>
    <p style="font-family:Arial,sans-serif;font-weight:bold;color:#F3C6D2;margin:0">${esc(v.ref)} · World English Bible</p></div>
   <p style="font-size:18px;line-height:1.5;border-left:3px solid #B58B4A;padding-left:14px;margin:24px 0">${esc(declaration)}</p>
   <p style="margin:28px 0"><a href="${link}" style="background:#173F35;color:#F7F5EF;font-family:Arial,sans-serif;font-weight:bold;text-decoration:none;padding:14px 22px;border-radius:999px;display:inline-block">Read, listen and pray</a></p>
   <p style="font-family:Arial,sans-serif;font-size:12px;color:#53605B">You’re getting this because you asked for the daily word from Word for This Moment. <a href="{{ unsubscribe }}" style="color:#53605B">Unsubscribe</a></p>
  </div></body></html>`;
  const c = await post('https://api.brevo.com/v3/emailCampaigns', { 'api-key': env.BREVO_API_KEY }, {
    name: `Daily word ${today.toISOString().slice(0, 10)}`, subject: `Today’s word · ${v.ref}`,
    sender: { name: 'Word for This Moment', email: env.BREVO_SENDER_EMAIL }, htmlContent,
    recipients: { listIds: [Number(env.BREVO_LIST_ID)] } });
  await post(`https://api.brevo.com/v3/emailCampaigns/${c.id}/sendNow`, { 'api-key': env.BREVO_API_KEY }, {});
});

// Text messages (Brevo SMS — needs SMS credits)
if (env.BREVO_API_KEY && env.BREVO_SMS_LIST_ID) await send('Text message', () =>
  post('https://api.brevo.com/v3/smsCampaigns', { 'api-key': env.BREVO_API_KEY }, {
    name: `Daily word SMS ${today.toISOString().slice(0, 10)}`, sender: (env.BREVO_SMS_SENDER || 'WordMoment').slice(0, 11),
    content: plain(`Today's word: "${short(v.text, 140)}" ${v.ref}. Read & pray: ${link}`),
    recipients: { listIds: [Number(env.BREVO_SMS_LIST_ID)] }, scheduledAt: new Date(Date.now() + 3 * 60000).toISOString() }));

// WhatsApp: channels can't be posted to automatically for free, so print a ready-to-paste message.
console.log(`\n----- WhatsApp message (copy & paste) -----\n📖 *Today’s word*\n\n“${v.text}”\n— ${v.ref}\n\n🙏 ${declaration}\n\n${link}\n-------------------------------------------`);

console.log('\nResults:\n' + (results.length ? results.join('\n') : 'No channels set up yet — add secrets in GitHub to switch them on.'));
if (results.some(r => r.includes('FAILED'))) process.exit(1);
