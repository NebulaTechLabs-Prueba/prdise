import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4173';
const EMAIL = 'admin@livinginprdise.com';
const PASS  = 'admin@livinginprdise.com';
const STAMP = 'e2e-persist-' + Date.now().toString(36);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem('prdise_lang', JSON.stringify('es')));
const page = await ctx.newPage();
const errs = [];
page.on('console',   m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + String(e).slice(0, 200)));

const log = [];
const push = (o) => log.push({ t: new Date().toISOString().slice(11, 23), ...o });

// LOGIN
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
await page.locator('input[type="email"]').first().fill(EMAIL);
const pwd = page.locator('input[type="password"]').first();
await pwd.fill(PASS);
await pwd.press('Enter');
await page.waitForTimeout(3500);
push({ step: 'login-done', url: page.url() });

// Ir a Tours desde el sidebar
await page.locator('button:has-text("Tours")').first().click().catch(() => {});
await page.waitForTimeout(1500);
push({ step: 'nav-tours' });

// Editar primer tour (botón "Editar" dentro de una card)
const firstEditBtn = page.locator('.adm-pcard-btn:has-text("Editar"), .adm-pcard-btn:has-text("Edit")').first();
const editCount = await firstEditBtn.count();
push({ step: 'find-edit', count: editCount });
if (editCount === 0) {
  push({ step: 'ABORT-no-edit-button' });
  console.log(JSON.stringify({ log, errs }, null, 2));
  await browser.close();
  process.exit(1);
}
await firstEditBtn.click();
await page.waitForTimeout(2000);
await page.screenshot({ path: '_shots/rt-01-editor-open.png', fullPage: true });

// Cambiar a pestaña Español si existe
const esTab = page.locator('button:has-text("Español")').first();
if (await esTab.count()) {
  await esTab.click().catch(() => {});
  await page.waitForTimeout(500);
}

// Localizar textarea "Notas Importantes" (label español)
const ta = page.locator('label:has-text("Notas Importantes") + textarea, label:has-text("Important Notes") + textarea').first();
const taCount = await ta.count();
push({ step: 'find-notes-textarea', count: taCount });
if (taCount === 0) {
  push({ step: 'ABORT-no-notes-textarea' });
  console.log(JSON.stringify({ log, errs }, null, 2));
  await browser.close();
  process.exit(1);
}

// Leer valor previo, escribir stamp único
const prev = await ta.inputValue();
push({ step: 'notes-before', value: prev.slice(0, 60) });
await ta.fill(prev + '\n' + STAMP);
push({ step: 'notes-written', stamp: STAMP });

await page.screenshot({ path: '_shots/rt-02-notes-filled.png', fullPage: true });

// Guardar
const saveBtn = page.locator('button:has-text("Guardar")').first();
const saveCount = await saveBtn.count();
push({ step: 'find-save', count: saveCount });
await saveBtn.click();
await page.waitForTimeout(4000);
await page.screenshot({ path: '_shots/rt-03-after-save.png', fullPage: true });
push({ step: 'save-clicked' });

// Verificar toast / cierre de modal
const stillOpen = await page.locator('.adm-modal').count();
push({ step: 'modal-still-open', count: stillOpen });

// REFRESH — probar persistencia real
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4500);
push({ step: 'reloaded' });

// Ir a Tours
await page.locator('button:has-text("Tours")').first().click().catch(() => {});
await page.waitForTimeout(1500);

// Editar el MISMO primer tour (asumimos misma posición tras refresh)
const editAgain = page.locator('.adm-pcard-btn:has-text("Editar"), .adm-pcard-btn:has-text("Edit")').first();
await editAgain.click();
await page.waitForTimeout(2500);
await page.screenshot({ path: '_shots/rt-04-editor-reopened.png', fullPage: true });

const esTab2 = page.locator('button:has-text("Español")').first();
if (await esTab2.count()) { await esTab2.click().catch(() => {}); await page.waitForTimeout(500); }

const ta2 = page.locator('label:has-text("Notas Importantes") + textarea, label:has-text("Important Notes") + textarea').first();
const persisted = await ta2.inputValue();
const stampFound = persisted.includes(STAMP);
push({ step: 'persistence-check', stampFound, valueSample: persisted.slice(-100) });

console.log(JSON.stringify({ log, errs, stampFound, STAMP }, null, 2));
await browser.close();
process.exit(stampFound ? 0 : 2);
