# prdise

SaaS de reservas para Puerto Rico: estadías, tours y traslados (transfers) en la costa oeste. Plataforma con sitio público bilingüe (ES/EN), carrito de reservas, checkout multi-método de pago y panel administrativo.

## Estado actual

Este repositorio contiene **únicamente el entregable inicial del equipo de diseño**: un componente React monolítico (`PrdiseApp.jsx`) que define la UI completa, los flujos de navegación, el carrito, el checkout y el panel admin como referencia visual y funcional.

El backend, la integración con Supabase, los procesadores de pago, la persistencia y el despliegue todavía no existen en este commit. Se irán agregando en commits posteriores.

## Sobre los datos de demostración

`PrdiseApp.jsx` incluye listas hardcoded (hoteles, tours, vehículos, rutas) y un set de cuentas de login de demostración (`admin@prdise.com`, `user@prdise.com`, etc., con contraseñas tipo `admin123`).

Estos no son credenciales reales: son **fixtures de UI** usadas por los botones "Login as admin / user / employee" de la pantalla de inicio de sesión, pensados para que el equipo pueda navegar el panel admin sin un backend conectado. Serán eliminados al integrar Supabase Auth.

## Stack previsto

- Next.js (App Router)
- Supabase (Auth, Postgres, Storage)
- Despliegue en VPS Hetzner (Ubuntu)

## Convenciones

- Mensajes de commit en español.
- Ramas: `main`, `dev`, `fix` (gitflow simplificado).
- Contenido editable y copy en ES/EN, con columnas separadas por idioma en la DB.
- Zona horaria de negocio: `America/Puerto_Rico` (AST, sin DST).
- Moneda base: USD (almacenada en centavos como entero en la DB).
"" 
