#!/usr/bin/env node
/**
 * Email deliverability check for allamericantattooconvention.com (4c).
 * READ-ONLY: public DNS over HTTPS (dns.google). Plain `dig` from some
 * networks returned timeouts and false empties for this domain on 2026-09-26,
 * so this does not use the system resolver.
 *
 *   node scripts/check-email-dns.mjs
 *
 * Checks the three mail streams that use the domain:
 *   1. Staff mail (Google Workspace) sent as @allamericantattooconvention.com:
 *      root MX, root SPF (must include _spf.google.com), Google DKIM.
 *   2. The platform's mail (Resend) sent as @send.allamericantattooconvention.com
 *      - also Supabase Auth's custom SMTP: DKIM, envelope SPF, bounce MX.
 *   3. DMARC on the root (applies to subdomains unless sp= says otherwise).
 * Then probes DNS names that other bulk senders (GoHighLevel/Mailgun,
 * SendGrid, Mailchimp, HubSpot, ...) leave behind, as a HINT about other
 * senders. DNS cannot prove a sender does not exist: DMARC aggregate reports
 * (rua) are the authority on who sends as the domain.
 *
 * Verdict "p=quarantine: READY (DNS)" needs every FAIL cleared. Moving the
 * policy additionally needs a clean window of aggregate reports.
 */
const ROOT = 'allamericantattooconvention.com'
const SEND = `send.${ROOT}`

async function q(name, type) {
  const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`, { signal: AbortSignal.timeout(10000) })
  const d = await r.json()
  if (d.Status !== 0 && d.Status !== 3) throw new Error(`${name} ${type}: DNS status ${d.Status}`)
  return (d.Answer ?? []).filter(a => a.type === { TXT: 16, MX: 15, CNAME: 5 }[type]).map(a => a.data.replace(/^"|"$/g, '').replace(/" "/g, ''))
}

const results = []
const add = (level, what, detail) => results.push({ level, what, detail })

try {
  // ── 1. Staff mail (Google Workspace) ────────────────────────
  const mx = await q(ROOT, 'MX')
  if (mx.some(m => /google(mail)?\.com\.?$/i.test(m))) add('PASS', 'root MX', 'Google Workspace receives mail')
  else add('FAIL', 'root MX', mx.length ? `not Google: ${mx.join(', ')}` : 'no MX - mail to @domain bounces')

  const rootTxt = await q(ROOT, 'TXT')
  const spf = rootTxt.filter(t => /^v=spf1\b/i.test(t))
  if (spf.length === 0) add('FAIL', 'root SPF', 'none - staff mail from @domain has no SPF')
  else if (spf.length > 1) add('FAIL', 'root SPF', `${spf.length} SPF records - receivers treat that as a permanent error; merge into one`)
  else {
    const s = spf[0]
    add(/include:_spf\.google\.com/i.test(s) ? 'PASS' : 'FAIL', 'root SPF includes Google', s)
    const lookups = (s.match(/\b(include:|a\b|a:|mx\b|mx:|ptr|exists:|redirect=)/gi) ?? []).length
    add(lookups <= 10 ? 'PASS' : 'FAIL', 'root SPF lookup count', `${lookups} direct DNS-lookup terms (limit 10, nested includes count too)`)
    add(/[~-]all$/i.test(s) ? 'PASS' : 'WARN', 'root SPF ends in ~all or -all', s.match(/\S+all$/i)?.[0] ?? 'no all term')
  }

  const gdkim = await q(`google._domainkey.${ROOT}`, 'TXT')
  add(gdkim.some(t => /p=[A-Za-z0-9+/]{100,}/.test(t)) ? 'PASS' : 'FAIL', 'Google Workspace DKIM (google._domainkey)',
    gdkim.length ? 'present' : 'none - turn on DKIM in Google Admin > Apps > Gmail > Authenticate email, then publish the record')

  // ── 2. Platform mail (Resend, also Supabase Auth SMTP) ──────
  const rdkim = await q(`resend._domainkey.${SEND}`, 'TXT')
  add(rdkim.some(t => /p=[A-Za-z0-9+/]{100,}/.test(t)) ? 'PASS' : 'FAIL', `Resend DKIM (resend._domainkey.${SEND})`, rdkim.length ? 'present' : 'none')
  const bounceMx = await q(`send.${SEND}`, 'MX')
  add(bounceMx.some(m => /amazonses\.com\.?$/i.test(m)) ? 'PASS' : 'FAIL', `Resend bounce MX (send.${SEND})`, bounceMx.join(', ') || 'none')
  const bounceSpf = (await q(`send.${SEND}`, 'TXT')).filter(t => /^v=spf1/i.test(t))
  add(bounceSpf.some(t => /include:amazonses\.com/i.test(t)) ? 'PASS' : 'FAIL', `Resend envelope SPF (send.${SEND})`, bounceSpf.join(' | ') || 'none')

  // ── 3. DMARC ────────────────────────────────────────────────
  const dmarc = (await q(`_dmarc.${ROOT}`, 'TXT')).filter(t => /^v=DMARC1/i.test(t))
  if (dmarc.length !== 1) add('FAIL', 'DMARC', dmarc.length ? 'more than one record' : 'none')
  else {
    const tags = Object.fromEntries(dmarc[0].split(';').map(p => p.trim().split('=')).filter(p => p.length === 2).map(([k, v]) => [k.toLowerCase(), v]))
    add('PASS', 'DMARC present', dmarc[0])
    add(tags.rua ? 'PASS' : 'WARN', 'DMARC aggregate reports (rua)', tags.rua ?? 'none - you cannot see who sends as the domain')
    add('INFO', 'DMARC policy', `p=${tags.p ?? '?'}${tags.sp ? `, sp=${tags.sp}` : ' (subdomains inherit p)'}${tags.pct ? `, pct=${tags.pct}` : ''}`)
  }

  // ── Hints: DNS left by other senders ────────────────────────
  const probes = [
    ['GoHighLevel / LeadConnector (Mailgun)', [`mg.${ROOT}`, `mail.${ROOT}`, `replies.${ROOT}`, `lc.${ROOT}`, `email.${ROOT}`], ['MX', 'TXT']],
    ['Mailgun DKIM', [`mx._domainkey.${ROOT}`, `smtp._domainkey.${ROOT}`, `pic._domainkey.${ROOT}`, `k1._domainkey.${ROOT}`, `krs._domainkey.${ROOT}`], ['TXT', 'CNAME']],
    ['SendGrid', [`s1._domainkey.${ROOT}`, `s2._domainkey.${ROOT}`], ['CNAME', 'TXT']],
    ['HubSpot', [`hs1._domainkey.${ROOT}`, `hs2._domainkey.${ROOT}`], ['CNAME']],
    ['Mailchimp / Mandrill', [`k2._domainkey.${ROOT}`, `k3._domainkey.${ROOT}`, `mte1._domainkey.${ROOT}`], ['CNAME', 'TXT']],
    ['Microsoft 365', [`selector1._domainkey.${ROOT}`], ['CNAME']],
    ['Zoho', [`zmail._domainkey.${ROOT}`], ['TXT']],
  ]
  for (const [who, names, types] of probes) {
    for (const n of names) for (const t of types) {
      const a = await q(n, t)
      if (a.length) add('HINT', `${who}: ${n} ${t}`, a.join(' | ').slice(0, 140))
    }
  }
} catch (e) {
  add('FAIL', 'lookup', String(e))
}

for (const r of results) console.log(`${r.level.padEnd(5)} ${r.what}${r.detail ? ` - ${r.detail}` : ''}`)
const fails = results.filter(r => r.level === 'FAIL')
const hints = results.filter(r => r.level === 'HINT')
console.log(`\n${fails.length ? `p=quarantine: NOT READY (${fails.length} FAIL)` : 'p=quarantine: READY (DNS). Also needs a clean window of DMARC aggregate reports before changing p.'}`)
if (!hints.length) console.log('No DNS traces of other bulk senders found. That is a hint, not proof: check the rua reports for unknown sources.')
process.exit(fails.length ? 1 : 0)
