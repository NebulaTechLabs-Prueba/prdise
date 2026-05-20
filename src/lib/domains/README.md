# Dominios

Estructura modular monolítica. Cada dominio agrupa su modelo de datos, queries, server actions, schemas (zod) y utilidades.

- `stays/` — hoteles, villas, casas (alojamiento).
- `tours/` — experiencias guiadas.
- `transfers/` — traslados vehiculares (incluye integración futura con calendario externo del proveedor).
- `shared/` — utilidades transversales (auth, moneda, fechas TZ Puerto Rico, idioma ES/EN).

Convención por dominio:

```
domains/<dominio>/
  index.ts        # barrel exports
  schema.ts       # zod schemas / tipos
  queries.ts      # lecturas (Supabase select)
  actions.ts      # Server Actions (mutaciones)
  types.ts        # tipos derivados
```
