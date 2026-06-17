#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const env = await readFile(".env.local", "utf8").then((s) => {
  const out = {};
  for (const line of s.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
});

const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const REF = "krmihhwpwhvycveupiwy";

const action = process.argv[2];

if (action === "patch") {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      smtp_max_frequency: 5,
      rate_limit_email_sent: 30,
      mailer_otp_length: 6,
    }),
  });
  console.log(res.status, await res.text());
  process.exit(0);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});
const cfg = await res.json();
const interesting = [
  "smtp_max_frequency",
  "smtp_host",
  "smtp_port",
  "smtp_admin_email",
  "smtp_sender_name",
  "rate_limit_email_sent",
  "rate_limit_token_refresh",
  "rate_limit_verify",
  "rate_limit_otp",
  "rate_limit_sms_sent",
  "rate_limit_anonymous_users",
  "mailer_autoconfirm",
  "mailer_otp_exp",
  "mailer_otp_length",
  "mailer_secure_email_change_enabled",
  "site_url",
];
for (const k of interesting) {
  console.log(k.padEnd(28), cfg[k]);
}
