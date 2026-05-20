# Email templates para prdise

6 plantillas HTML para los emails transaccionales que Supabase Auth envía.
Branding consistente con la app (paleta gold/orange/dark). Bilingüe ES/EN
(ES como idioma principal porque el negocio está en Puerto Rico; EN debajo
como referencia para visitantes internacionales).

## Cómo aplicarlas en Supabase

1. Abrir Dashboard → tu proyecto → **Authentication → Email Templates**.
2. Para cada uno de los 6 templates listados abajo, pegar el contenido del
   archivo `.html` correspondiente en el campo "Message (HTML)".
3. Ajustar el "Subject" según la guía abajo.
4. Click **Save**.

| Template Supabase | Archivo | Subject sugerido |
|---|---|---|
| Confirm sign up | `confirm-signup.html` | `Confirma tu cuenta · prdise` |
| Invite user | `invite-user.html` | `Te invitamos a prdise` |
| Magic link or OTP | `magic-link.html` | `Tu enlace de acceso · prdise` |
| Change email address | `change-email.html` | `Confirma tu nuevo email · prdise` |
| Reset password | `reset-password.html` | `Restablecer contraseña · prdise` |
| Reauthentication | `reauthentication.html` | `Confirma tu identidad · prdise` |

## Variables que Supabase reemplaza

Cada template usa placeholders que Supabase sustituye al enviar:

- `{{ .ConfirmationURL }}` — URL completa con el código de confirmación
- `{{ .Token }}` — código OTP de 6 dígitos (cuando aplica)
- `{{ .Email }}` — dirección del destinatario
- `{{ .SiteURL }}` — URL base configurada en Supabase (debe ser `http://46.225.63.21`)
- `{{ .NewEmail }}` — solo en change-email
- `{{ .Data.first_name }}` — del `raw_user_meta_data`

Recuerda configurar **Site URL** en Authentication → URL Configuration con
`http://46.225.63.21` y la lista de "Redirect URLs" con `http://46.225.63.21/auth/callback`
y `http://46.225.63.21/auth/reset-password`.

## SMTP — Supabase default vs Brevo

**Supabase default SMTP** tiene rate limit de **3 emails/hora** y los emails
caen frecuentemente en spam. Solo sirve para QA inicial, no producción.

**Brevo (recomendado para producción)**:

1. Crear cuenta en https://www.brevo.com (gratis hasta 300 emails/día).
2. Brevo → Account → **SMTP & API → SMTP keys → Generate a new SMTP key**.
3. En Supabase Dashboard → Authentication → **Settings → SMTP Settings → Enable Custom SMTP**:

   | Campo | Valor |
   |---|---|
   | Sender email | el email verificado en Brevo (ej. `hola@prdise.com` si registras el dominio o tu personal hasta tener uno) |
   | Sender name | `prdise` |
   | Host | `smtp-relay.brevo.com` |
   | Port | `2525` (587 está bloqueado en algunos VPS; 2525 es el workaround documentado) |
   | Username | tu email Brevo |
   | Password | la SMTP key generada |
   | Minimum interval between emails | `60` (default OK) |

4. Verificar sender en Brevo (recibirás un email para confirmar).
5. Probar con un signup real — el email debe llegar en <30 segundos.

## Plain-text fallback

Los 6 templates incluyen un bloque `<noscript>` con el equivalente en texto
plano (cubre clientes que no renderizan HTML). Si Supabase soporta agregar
una versión text/plain explícita, copia el contenido del `<noscript>` allí.
