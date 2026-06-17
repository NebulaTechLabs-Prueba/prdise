#!/usr/bin/env node
/**
 * Sube los HTML de docs/email-templates/* a Supabase Auth via Management API.
 * PM 2026-06-17: el bloque <noscript> al final estaba "filtrándose" como
 * texto visible en Gmail. Se removió de los archivos locales — este script
 * sincroniza el dashboard.
 *
 * Uso: node scripts/push-email-templates.mjs
 * Requiere SUPABASE_ACCESS_TOKEN en .env.local
 */
import { readFile } from "node:fs/promises";

// Mini-parser de .env.local — evita la dep de dotenv
const env = await readFile(".env.local", "utf8").then((s) => {
  const out = {};
  for (const line of s.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
});

const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = "krmihhwpwhvycveupiwy";

if (!TOKEN) {
  console.error("Falta SUPABASE_ACCESS_TOKEN en .env.local");
  process.exit(1);
}

const TEMPLATES = [
  { file: "docs/email-templates/confirm-signup.html",     key: "mailer_templates_confirmation_content",    subjectKey: "mailer_subjects_confirmation",   subject: "Confirma tu cuenta · Confirm your account" },
  { file: "docs/email-templates/reset-password.html",     key: "mailer_templates_recovery_content",        subjectKey: "mailer_subjects_recovery",       subject: "Restablece tu contraseña · Reset your password" },
  { file: "docs/email-templates/magic-link.html",         key: "mailer_templates_magic_link_content",      subjectKey: "mailer_subjects_magic_link",     subject: "Tu enlace de acceso · Your sign-in link" },
  { file: "docs/email-templates/change-email.html",       key: "mailer_templates_email_change_content",    subjectKey: "mailer_subjects_email_change",   subject: "Confirma tu nuevo email · Confirm your new email" },
  { file: "docs/email-templates/invite-user.html",        key: "mailer_templates_invite_content",          subjectKey: "mailer_subjects_invite",         subject: "Te invitamos a prdise · You're invited to prdise" },
  { file: "docs/email-templates/reauthentication.html",   key: "mailer_templates_reauthentication_content",subjectKey: "mailer_subjects_reauthentication",subject: "Confirma tu identidad · Confirm your identity" },
];

const payload = {};
for (const t of TEMPLATES) {
  const html = await readFile(t.file, "utf8");
  payload[t.key] = html;
  payload[t.subjectKey] = t.subject;
}

const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
const res = await fetch(url, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

if (!res.ok) {
  const txt = await res.text();
  console.error("FAILED", res.status, txt);
  process.exit(1);
}
console.log("OK — plantillas sincronizadas");
