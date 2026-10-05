#!/usr/bin/env node
/**
 * Generate the 2027 Square-invoice import (and its teardown) as SQL for Ryan to
 * run. Writes nothing to any database. Contains no customer data: the CSV and
 * the overrides live in supabase/.imports/ (gitignored) or ~/Downloads, and the
 * generated SQL is written to supabase/.imports/ too.
 *
 *   node scripts/import-square-2027.mjs <invoices.csv> <overrides.json> [outDir]
 *     -> <outDir>/square-2027-import.sql, square-2027-teardown.sql, square-2027-dry-run.txt
 *
 * CSV: the "Import" sheet export. Lines 1-3 are a title and instructions; the
 * header row is line 4. Only rows whose "YOUR DECISION" is "import" are used.
 *
 * Rules (Ryan, 2026-10-05):
 *   - Admin-created (user_id null), approved, approved_at = invoice issue date,
 *     total_amount = invoiced (grandfathered; never recomputed).
 *   - One invoice: amount = invoiced, amount_paid = paid, payment_method
 *     'square' when anything was paid, payment_reference "Square #N" plus every
 *     payment (date, method, amount): invoices keep only a running total.
 *   - Milestones by the existing rule (deposit at >= 25%, rounded up; final at
 *     100%) dated by the actual payments; an override can set the deposit date.
 *   - Due dates: unpaid deposits due `unpaid_deposit_due`; every balance due
 *     `balance_due` (invoice.due_date) / `final_due_at` (application).
 *   - needs_roster = true. No emails: plain SQL, no API.
 *   - Every row gets an id generated here, so the teardown deletes exactly
 *     what the import created and nothing else.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

// ── tiny CSV parser (quoted fields, doubled quotes, commas, newlines) ──
export function parseCsv(text) {
  const rows = []; let row = []; let f = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++ }
      else if (c === '"') q = false
      else f += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(f); f = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(f); rows.push(row); row = []; f = ''
    } else f += c
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row) }
  return rows
}

const cents = s => {
  const v = String(s ?? '').replace(/[$,\s]/g, '')
  if (v === '') return 0
  if (!/^\d+(\.\d{1,2})?$/.test(v)) throw new Error(`not a dollar amount: "${s}"`)
  return Math.round(parseFloat(v) * 100)
}
const int = s => { const n = parseInt(String(s ?? '').trim() || '0', 10); if (!Number.isInteger(n) || n < 0) throw new Error(`not a count: "${s}"`); return n }
const isoDate = s => { const m = String(s).match(/\d{4}-\d{2}-\d{2}/); if (!m) throw new Error(`no date in "${s}"`); return m[0] }
const usd = c => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const minDeposit = c => (c <= 0 ? 0 : Math.ceil(c * 0.25))     // invoice-payment.ts / pricing.ts DEPOSIT_PERCENT
const sql = v => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const ts = d => `'${d} 12:00 America/New_York'::timestamptz`    // payment dates at midday Eastern

const ADDONS = {           // CSV wording -> { kind, term } (src/lib/pricing.ts AddOnKind)
  'extra table': { kind: 'extra_table', term: null },
  'extra chairs': { kind: 'extra_chairs', term: null },
  'armrest weekend': { kind: 'arm_rest', term: 'weekend' },
  'armrest daily': { kind: 'arm_rest', term: 'daily' },
  'tattoo bed weekend': { kind: 'tattoo_bed', term: 'weekend' },
  'tattoo bed daily': { kind: 'tattoo_bed', term: 'daily' },
  'tattoo light weekend': { kind: 'tattoo_light', term: 'weekend' },
  'tattoo light daily': { kind: 'tattoo_light', term: 'daily' },
}
export function parseAddOns(s) {
  const out = []
  for (const part of String(s ?? '').split(';').map(x => x.trim()).filter(Boolean)) {
    const m = part.match(/^(.*?)\s*x(\d+)\b/i)
    if (!m) throw new Error(`add-on without a quantity: "${part}"`)
    const map = ADDONS[m[1].trim().toLowerCase()]
    if (!map) throw new Error(`unknown add-on: "${part}"`)
    out.push({ kind: map.kind, qty: parseInt(m[2], 10), term: map.term })
  }
  return out
}

export function parsePayments(s) {
  const t = String(s ?? '').trim()
  if (!t || /^none$/i.test(t)) return []
  return t.split(';').map(x => x.trim()).filter(Boolean).map(p => {
    const m = p.match(/^(\d{4}-\d{2}-\d{2})\s+(.+?)\s+\$([\d,]+(?:\.\d{1,2})?)$/)
    if (!m) throw new Error(`payment not "YYYY-MM-DD Method $N": "${p}"`)
    return { date: m[1], method: m[2], cents: cents(m[3]) }
  }).sort((a, b) => a.date.localeCompare(b.date))
}

/** Rows to import, normalised and checked. Throws on anything unresolved. */
export function buildRows(csvText, overrides) {
  const all = parseCsv(csvText)
  const hdr = all[3]
  if (!hdr || hdr[0] !== 'Invoice #' || !hdr.includes('YOUR DECISION')) throw new Error('header row (line 4) not found')
  const col = name => { const i = hdr.indexOf(name); if (i < 0) throw new Error(`missing column "${name}"`); return i }
  const C = Object.fromEntries(['Invoice #', 'Issued', 'Contact', 'Business / display name', 'Email', 'Phone', 'Type', 'Artist single', 'Artist double',
    'Vendor single', 'Vendor double', 'Food truck', 'Corners', 'Permits (artists)', 'Add-ons', 'Invoiced ($)', 'Paid ($)', 'Balance ($)',
    'Payments (date, method, amount)', 'Balance due', 'YOUR DECISION'].map(n => [n, col(n)]))
  const out = []; const problems = []; const emails = new Set()
  for (const r of all.slice(4)) {
    const inv = (r[C['Invoice #']] ?? '').trim()
    if (!inv.startsWith('#')) continue                       // the totals row
    if ((r[C['YOUR DECISION']] ?? '').trim().toLowerCase() !== 'import') continue
    const o = overrides.rows?.[inv] ?? {}
    try {
      // Email first, so a duplicate is caught even when the other row fails.
      const email = r[C['Email']].trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email)) throw new Error('email missing or malformed')
      if (emails.has(email)) throw new Error('same email as another imported row')
      emails.add(email)
      const type = r[C['Type']].trim().toLowerCase()
      const kind = type === 'food truck' ? 'food_truck' : type.includes('artist') ? 'artist' : type === 'vendor' ? 'vendor' : null
      if (!kind) throw new Error(`unknown type "${r[C['Type']]}"`)
      let business = (o.business_name ?? r[C['Business / display name']]).trim()
      if (/[?()]|confirm/i.test(business)) throw new Error(`business name still unresolved: "${business}" (set business_name in overrides)`)
      let contact = r[C['Contact']].trim()
      if (o.contact_name === '=business') contact = business
      else if (o.contact_name) contact = o.contact_name
      if (!contact || /[?()]/.test(contact)) throw new Error(`contact name unresolved: "${contact}"`)
      const invoiced = cents(r[C['Invoiced ($)']]); const paid = cents(r[C['Paid ($)']]); const balance = cents(r[C['Balance ($)']])
      if (invoiced <= 0) throw new Error('invoiced must be > 0')
      if (paid + balance !== invoiced) throw new Error(`paid ${usd(paid)} + balance ${usd(balance)} != invoiced ${usd(invoiced)}`)
      const payments = parsePayments(r[C['Payments (date, method, amount)']])
      const sumPaid = payments.reduce((s, p) => s + p.cents, 0)
      if (sumPaid !== paid) throw new Error(`payments add up to ${usd(sumPaid)}, Paid column says ${usd(paid)}`)
      // Milestones: the existing rule, dated by the payment that crossed it.
      let depositAt = null, finalAt = null, run = 0
      for (const p of payments) {
        run += p.cents
        if (!depositAt && run >= minDeposit(invoiced)) depositAt = p.date
        if (!finalAt && run >= invoiced) finalAt = p.date
      }
      if (o.deposit_paid_at) depositAt = o.deposit_paid_at       // honoured by Ryan (e.g. a 20% Square deposit)
      const row = {
        invoice: inv, kind, business, contact, email,
        phone: r[C['Phone']].trim() || null,
        instagram: o.instagram ?? null,
        issued: isoDate(r[C['Issued']]),
        as: int(r[C['Artist single']]), ad: int(r[C['Artist double']]), vs: int(r[C['Vendor single']]), vd: int(r[C['Vendor double']]),
        corners: int(r[C['Corners']]), permits: int(r[C['Permits (artists)']]),
        addOns: parseAddOns(r[C['Add-ons']]),
        isVeteran: o.is_veteran === true,
        invoiced, paid, balance, payments, depositAt, finalAt,
        assignBooth: o.assign_booth ?? null,
        appId: randomUUID(), truckId: randomUUID(), invoiceId: randomUUID(),
      }
      if (kind !== 'food_truck' && row.as + row.ad + row.vs + row.vd === 0) throw new Error('no booths')
      if (kind === 'food_truck' && int(r[C['Food truck']]) !== 1) throw new Error('food truck row without Food truck = 1')
      if (kind === 'artist' && row.permits > row.as * 2 + row.ad * 4) throw new Error(`permits ${row.permits} exceed 2 per single / 4 per double`)
      if (kind === 'vendor' && row.permits > 0) throw new Error('vendor row with permits')
      out.push(row)
    } catch (e) { problems.push(`${inv}: ${e.message}`) }
  }
  for (const k of Object.keys(overrides.rows ?? {})) if (!out.some(r => r.invoice === k) && !problems.some(p => p.startsWith(k))) problems.push(`${k}: override for a row that is not imported`)
  return { rows: out, problems }
}

function importSql(rows, ov) {
  const apps = rows.filter(r => r.kind !== 'food_truck'), trucks = rows.filter(r => r.kind === 'food_truck')
  const totInv = rows.reduce((s, r) => s + r.invoiced, 0), totPaid = rows.reduce((s, r) => s + r.paid, 0)
  const L = []
  L.push(`-- ============================================================
-- AATC 2027: import of ${rows.length} exhibitors from Square invoices (${apps.length} applications, ${trucks.length} food trucks).
-- GENERATED by scripts/import-square-2027.mjs on ${new Date().toISOString()}. Do not edit; regenerate.
-- CONTAINS CUSTOMER CONTACT DATA: never commit this file (supabase/.imports/ is gitignored).
--
-- Run once, whole file, in the Supabase SQL editor. One transaction: any
-- guard failure rolls back everything. Sends no email (plain SQL).
-- Undo: square-2027-teardown.sql (exactly these rows, by id).
-- Expected totals: invoiced ${usd(totInv)}, paid ${usd(totPaid)}.
-- ============================================================
begin;

do $$
declare v_event uuid; v_dupes text;
begin
  v_event := (select id from public.events where is_active and name = ${sql(ov.event_name)});
  if v_event is null then raise exception 'ABORT: active event % not found', ${sql(ov.event_name)}; end if;

  -- Never twice, and never over an existing exhibitor (by email).
  v_dupes := (select string_agg(e, ', ') from unnest(array[${rows.map(r => sql(r.email)).join(', ')}]) e
               where exists (select 1 from public.applications a where lower(a.email) = e)
                  or exists (select 1 from public.food_trucks t where lower(t.email) = e)
                  or exists (select 1 from public.sponsorships s where lower(s.email) = e));
  if v_dupes is not null then raise exception 'ABORT: already on the site (application, food truck or sponsorship): %', v_dupes; end if;
  if exists (select 1 from public.invoices where payment_reference ~ '^Square #(${rows.map(r => r.invoice.slice(1)).join('|')})( |$)') then
    raise exception 'ABORT: an invoice for one of these Square numbers already exists';
  end if;
`)
  for (const r of rows.filter(x => x.assignBooth)) {
    L.push(`  if not exists (select 1 from public.booths where event_id = v_event and booth_number = ${sql(r.assignBooth)}
                   and application_id is null and is_sellable and not (held_for is not null and held_until > now())) then
    raise exception 'ABORT: booth ${r.assignBooth} is not free (assigned, held or not sellable) for ${r.invoice}';
  end if;
`)
  }
  for (const r of apps) {
    const exType = r.kind
    const depositDue = r.depositAt ? `${ts(r.issued)}` : `'${ov.unpaid_deposit_due} 23:59 America/New_York'::timestamptz`
    L.push(`  -- ${r.invoice}: ${r.kind} ${[r.as && `${r.as} artist single`, r.ad && `${r.ad} artist double`, r.vs && `${r.vs} vendor single`, r.vd && `${r.vd} vendor double`].filter(Boolean).join(' + ')}, ${r.corners} corner(s), ${r.permits} permit(s)${r.addOns.length ? ', add-ons' : ''}${r.isVeteran ? ', veteran' : ''}; ${usd(r.invoiced)}, paid ${usd(r.paid)}
  insert into public.applications (id, event_id, user_id, exhibitor_type, business_name, contact_name, email, phone, instagram,
      booth_size, artist_single_qty, artist_double_qty, vendor_single_qty, vendor_double_qty, corner_count, is_corner,
      artist_count, add_ons, is_veteran, total_amount, status, approved_at, deposit_due_at, final_due_at, needs_roster)
  values (${sql(r.appId)}, v_event, null, ${sql(exType)}, ${sql(r.business)}, ${sql(r.contact)}, ${sql(r.email)}, ${sql(r.phone)}, ${sql(r.instagram)},
      null, ${r.as}, ${r.ad}, ${r.vs}, ${r.vd}, ${r.corners}, ${r.corners > 0}, ${r.permits}, ${sql(JSON.stringify(r.addOns))}::jsonb, ${r.isVeteran},
      ${r.invoiced}, 'approved', ${ts(r.issued)}, ${depositDue}, ${sql(ov.final_due_at)}::timestamptz, true);
`)
  }
  for (const r of trucks) {
    L.push(`  -- ${r.invoice}: food truck, all weekend; ${usd(r.invoiced)}, paid ${usd(r.paid)}
  insert into public.food_trucks (id, event_id, user_id, business_name, contact_name, email, phone, instagram, days, is_published)
  values (${sql(r.truckId)}, v_event, null, ${sql(r.business)}, ${sql(r.contact)}, ${sql(r.email)}, ${sql(r.phone)}, ${sql(r.instagram)}, array['friday','saturday','sunday'], false);
`)
  }
  for (const r of rows) {
    const ref = `Square #${r.invoice.slice(1)}` + (r.payments.length ? ' · ' + r.payments.map(p => `${p.date} ${p.method} ${usd(p.cents)}`).join('; ') : ' · unpaid at import')
    const full = r.paid >= r.invoiced
    L.push(`  insert into public.invoices (id, ${r.kind === 'food_truck' ? 'food_truck_id' : 'application_id'}, amount, amount_paid, status, payment_method, payment_reference, due_date, paid_at, deposit_paid_at, final_paid_at)
  values (${sql(r.invoiceId)}, ${sql(r.kind === 'food_truck' ? r.truckId : r.appId)}, ${r.invoiced}, ${r.paid}, ${full ? "'paid'" : "'pending'"}, ${r.paid > 0 ? "'square'" : 'null'}, ${sql(ref)},
      ${sql(ov.balance_due)}::date, ${full ? ts(r.finalAt) : 'null'}, ${r.depositAt ? ts(r.depositAt) : 'null'}, ${r.finalAt ? ts(r.finalAt) : 'null'});
`)
  }
  for (const r of rows.filter(x => x.assignBooth)) {
    L.push(`  -- ${r.invoice}: booth ${r.assignBooth} (deposit paid), as Assign Booth would: reserved for the application.
  update public.booths set application_id = ${sql(r.appId)}, status = 'reserved'
   where event_id = v_event and booth_number = ${sql(r.assignBooth)} and application_id is null;
  if not found then raise exception 'ABORT: booth ${r.assignBooth} could not be assigned'; end if;
`)
  }
  L.push(`  -- Totals must match the sheet.
  if (select coalesce(sum(amount), 0) from public.invoices where id in (${rows.map(r => sql(r.invoiceId)).join(', ')})) <> ${totInv}
     or (select coalesce(sum(amount_paid), 0) from public.invoices where id in (${rows.map(r => sql(r.invoiceId)).join(', ')})) <> ${totPaid} then
    raise exception 'ABORT: imported totals do not match the sheet (invoiced ${usd(totInv)}, paid ${usd(totPaid)})';
  end if;
  raise notice 'IMPORTED: % applications, % food trucks, % invoices; invoiced ${usd(totInv)}, paid ${usd(totPaid)}', ${apps.length}, ${trucks.length}, ${rows.length};
end $$;

commit;

-- Read back (results grid):
select coalesce(a.business_name, t.business_name) as exhibitor, i.payment_reference, i.amount, i.amount_paid, i.status,
       i.deposit_paid_at::date as deposit_paid, i.final_paid_at::date as final_paid, i.due_date,
       a.deposit_due_at::date as deposit_due, (select string_agg(b.booth_number, ',') from public.booths b where b.application_id = a.id) as booths
  from public.invoices i
  left join public.applications a on a.id = i.application_id
  left join public.food_trucks t on t.id = i.food_truck_id
 where i.id in (${rows.map(r => sql(r.invoiceId)).join(', ')})
 order by i.payment_reference;
`)
  return L.join('\n')
}

function teardownSql(rows) {
  const apps = rows.filter(r => r.kind !== 'food_truck'), trucks = rows.filter(r => r.kind === 'food_truck')
  const invIds = rows.map(r => sql(r.invoiceId)).join(', ')
  const appIds = apps.map(r => sql(r.appId)).join(', ')
  const truckIds = trucks.map(r => sql(r.truckId)).join(', ')
  const expected = rows.map(r => `(${sql(r.invoiceId)}::uuid, ${r.paid}, ${r.invoiced})`).join(', ')
  return `-- ============================================================
-- TEARDOWN of the Square 2027 import: deletes exactly the ${rows.length} invoices, ${apps.length} applications and
-- ${trucks.length} food trucks that square-2027-import.sql created (by id), and releases their booths.
-- GENERATED by scripts/import-square-2027.mjs together with that import. CONTAINS CUSTOMER IDS: never commit.
-- Refuses, changing nothing, if any of them has moved on since the import:
-- a payment recorded, the amount changed, a portal account linked, a comp set.
-- ============================================================
begin;

do $$
declare v_bad text;
begin
  v_bad := (select string_agg(coalesce(i.payment_reference, i.id::text), '; ')
              from public.invoices i join (values ${expected}) as x(id, paid, amount) on x.id = i.id
             where coalesce(i.amount_paid, 0) <> x.paid or i.amount <> x.amount);
  if v_bad is not null then raise exception 'ABORT: payments or amounts changed since the import: %', v_bad; end if;
  if (select count(*) from public.invoices where id in (${invIds})) <> ${rows.length} then
    raise exception 'ABORT: not all ${rows.length} imported invoices are present (partly torn down already?)';
  end if;
  v_bad := (select string_agg(business_name, ', ') from public.applications
             where id in (${appIds || 'null'}) and (user_id is not null or comped_at is not null or permits_comped_at is not null));
  if v_bad is not null then raise exception 'ABORT: linked to a portal account or comped since the import: %', v_bad; end if;
  ${trucks.length ? `v_bad := (select string_agg(business_name, ', ') from public.food_trucks where id in (${truckIds}) and user_id is not null);
  if v_bad is not null then raise exception 'ABORT: food truck linked to a portal account since the import: %', v_bad; end if;` : ''}

  update public.booths set application_id = null, status = 'available' where application_id in (${appIds || 'null'});
  delete from public.invoices where id in (${invIds});
  ${apps.length ? `delete from public.applications where id in (${appIds});` : ''}
  ${trucks.length ? `delete from public.food_trucks where id in (${truckIds});` : ''}

  if exists (select 1 from public.invoices where id in (${invIds}))
     ${apps.length ? `or exists (select 1 from public.applications where id in (${appIds}))` : ''}
     ${trucks.length ? `or exists (select 1 from public.food_trucks where id in (${truckIds}))` : ''} then
    raise exception 'ABORT: rows survived the teardown';
  end if;
  raise notice 'TORN DOWN: ${rows.length} invoices, ${apps.length} applications, ${trucks.length} food trucks; booths released';
end $$;

commit;
`
}

function dryRun(rows, problems) {
  const L = [`DRY RUN - ${rows.length} rows to import${problems.length ? `, ${problems.length} PROBLEM(S): nothing generated` : ''}`]
  for (const p of problems) L.push(`  PROBLEM ${p}`)
  for (const r of rows) {
    const booths = [r.as && `AS${r.as}`, r.ad && `AD${r.ad}`, r.vs && `VS${r.vs}`, r.vd && `VD${r.vd}`].filter(Boolean).join('+')
    L.push(`  ${r.invoice} ${r.kind.padEnd(10)} ${r.business.padEnd(30)} ${(booths || 'food truck').padEnd(10)} corners ${r.corners} permits ${r.permits} addons ${r.addOns.map(a => `${a.kind}${a.term ? '/' + a.term : ''}x${a.qty}`).join(',') || '-'}${r.isVeteran ? ' VET' : ''} | ${usd(r.invoiced)} paid ${usd(r.paid)} | deposit ${r.depositAt ?? '-'} final ${r.finalAt ?? '-'}${r.assignBooth ? ` | booth ${r.assignBooth}` : ''}`)
  }
  L.push(`  totals: invoiced ${usd(rows.reduce((s, r) => s + r.invoiced, 0))}, paid ${usd(rows.reduce((s, r) => s + r.paid, 0))}`)
  return L.join('\n')
}

async function main() {
  const [csvPath, ovPath, outDir = 'supabase/.imports'] = process.argv.slice(2)
  if (!csvPath || !ovPath) { console.error('usage: node scripts/import-square-2027.mjs <invoices.csv> <overrides.json> [outDir]'); process.exit(1) }
  const overrides = JSON.parse(readFileSync(ovPath, 'utf8'))
  for (const k of ['event_name', 'unpaid_deposit_due', 'balance_due', 'final_due_at']) if (!overrides[k]) { console.error(`overrides: missing ${k}`); process.exit(1) }
  const { rows, problems } = buildRows(readFileSync(csvPath, 'utf8'), overrides)
  const report = dryRun(rows, problems)
  console.log(report)
  if (problems.length) process.exit(1)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'square-2027-dry-run.txt'), report + '\n')
  writeFileSync(join(outDir, 'square-2027-import.sql'), importSql(rows, overrides))
  writeFileSync(join(outDir, 'square-2027-teardown.sql'), teardownSql(rows))
  console.log(`\nwrote ${outDir}/square-2027-import.sql, square-2027-teardown.sql, square-2027-dry-run.txt`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
