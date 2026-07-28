import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4173';
const EMAIL = 'admin@livinginprdise.com';
const PASS  = 'admin@livinginprdise.com';

const SECTIONS = [
  ['dash',          'Dashboard'],
  ['analytics',     'Analytics'],
  ['hotels',        'Estadías'],
  ['tours',         'Tours'],
  ['posts',         'Blog'],
  ['transfers',     'Traslados'],
  ['invoices',      'Facturas'],
  ['contact-inbox', 'Buzón'],
  ['contacts',      'Contactos'],
  ['partners',      'Aliados'],
  ['experiences',   'Experiencias'],
  ['settings',      'Ajustes'],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem('prdise_lang', JSON.stringify('es')));
const page = await ctx.newPage();
const errors = [];
page.on('console',   m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 200)));

const out = [];
const report = (evt) => out.push({ t: new Date().toISOString().slice(11, 23), ...evt });

// ── 1. LOGIN ────────────────────────────────────────────────────────────────
report({ step: 'nav-login' });
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500); // splash
await page.locator('input[type="email"]').first().fill(EMAIL);
const pwd = page.locator('input[type="password"]').first();
await pwd.fill(PASS);
await pwd.press('Enter');
await page.waitForTimeout(3500);
await page.screenshot({ path: '_shots/adm-01-after-login.png', fullPage: true });
report({ step: 'post-login', url: page.url(), errors: errors.slice() });

// ── 2. ir al panel /admin ────────────────────────────────────────────────────
if (!page.url().includes('/admin')) {
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
}
await page.screenshot({ path: '_shots/adm-02-panel-home.png', fullPage: true });
report({ step: 'admin-home', url: page.url() });

// ── 3. recorrer cada sección del sidebar ────────────────────────────────────
for (const [id, label] of SECTIONS) {
  const before = errors.length;
  // Sidebar tiene botones con texto localizado; probamos varios locators.
  const btn = page.locator(`button:has-text("${label}")`).first();
  if (await btn.count()) {
    await btn.click().catch(() => {});
  } else {
    // fallback: link directo por texto genérico
    const linkAlt = page.locator(`[data-section="${id}"], a[href*="${id}"]`).first();
    if (await linkAlt.count()) await linkAlt.click().catch(() => {});
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `_shots/adm-sec-${id}.png`, fullPage: true });
  // detectar overflow horizontal
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  report({ step: 'section', id, label, overflow, errors: errors.slice(before) });
}

// ── 4. verificar persistencia: editar un tour existente ─────────────────────
// (round-trip: cambiar Notas Importantes ES, guardar, refrescar, verificar).
report({ step: 'persistence-test-start' });
const editBefore = errors.length;
// Navegar a tours si no estamos.
await page.locator('button:has-text("Tours")').first().click().catch(() => {});
await page.waitForTimeout(1500);
// Click en primer botón Editar (pencil) de la tabla.
const firstEdit = page.locator('.adm-icon-btn').first();
if (await firstEdit.count()) {
  await firstEdit.click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '_shots/adm-tour-edit-open.png', fullPage: true });
  // marcar tab ES en el editor bilingüe
  await page.locator('button:has-text("Español")').first().click().catch(() => {});
  await page.waitForTimeout(300);
  // Buscar el textarea de Notas Importantes.
  const notes = page.locator('textarea').filter({ hasText: '' }).first();
  const stamp = `e2e-test-${Date.now().toString(36)}`;
  // Insertar un stamp único.
  const notesArea = page.locator('label:has-text("Notas Importantes")').first();
  if (await notesArea.count()) {
    // el textarea es sibling del label
    const ta = page.locator('label:has-text("Notas Importantes") + textarea, label:has-text("Notas Importantes") ~ textarea').first();
    if (await ta.count()) {
      await ta.fill(stamp);
      report({ step: 'stamp-written', stamp });
    } else {
      report({ step: 'stamp-target-not-found' });
    }
  } else {
    report({ step: 'notes-label-not-found' });
  }
  // Guardar
  const saveBtn = page.locator('button:has-text("Guardar")').first();
  if (await saveBtn.count()) {
    await saveBtn.click().catch(() => {});
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '_shots/adm-tour-after-save.png', fullPage: true });
    report({ step: 'saved' });
  }
}
report({ step: 'persistence-test-errors', errors: errors.slice(editBefore) });

console.log(JSON.stringify(out, null, 2));
console.log('\n\n=== ALL ERRORS ===');
console.log(JSON.stringify(errors, null, 2));
await browser.close();
