# ALTA PRODUCTOS BC

Aplicación web para dar de alta productos **directamente en Business Central**, con numeración correlativa automática por fabricante o por categoría, y lectura en vivo de productos, fabricantes y categorías desde BC.

- App web: https://tecmelec.github.io/ALTA-PRODUCTOS-BC/
- Frontend: React + Vite, desplegado en GitHub Pages.
- Backend: funciones serverless en **Vercel** (Node/TypeScript), sin base de datos propia — **Business Central es la única fuente de verdad**.

## Arquitectura

```
Navegador (todos los usuarios)
        │  HTTPS
        ▼
GitHub Pages (frontend estático)
        │  fetch a /api/...
        ▼
Vercel Functions (backend)
        │  OAuth2 client credentials + OData
        ▼
Business Central (Items / Manufacturers / Item Categories)
```

El frontend **nunca** habla directamente con Business Central: las credenciales (Tenant ID, Client ID, Client Secret) viven solo en las variables de entorno del proyecto de Vercel.

No hay base de datos intermedia: cada alta de producto se escribe directamente en BC, y cada carga de la app lee la lista de productos/fabricantes/categorías en vivo desde BC.

## Regla de numeración de productos

- **Con fabricante**: `<3 primeras letras del código de fabricante><correlativo de 4 dígitos>`, ej. `ZEN0001`.
- **Genérico** (sin fabricante): `G<3 primeras letras de la categoría><correlativo de 4 dígitos>`, ej. `GELE0001`.

El correlativo se calcula en el backend consultando el último número existente en BC con ese mismo prefijo (`$filter=startswith(No,'PREFIJO')&$orderby=No desc&$top=1`), sumando 1. Si dos personas crean un producto casi a la vez y hay colisión de número, el backend reintenta automáticamente con el siguiente correlativo.

## Puesta en marcha del backend (Vercel)

### 1. Crear el proyecto en Vercel

1. Entra en https://vercel.com con tu cuenta (puedes registrarte gratis con GitHub).
2. "Add New" → "Project" → importa el repositorio `tecmelec/ALTA-PRODUCTOS-BC`.
3. En **"Root Directory"**, selecciona `backend-vercel`.
4. Framework preset: "Other" (no hace falta build, son solo funciones).
5. Despliega. Vercel te dará una URL tipo `https://alta-productos-bc-backend.vercel.app`.

### 2. Configurar las variables de entorno en Vercel

En el proyecto de Vercel → **Settings → Environment Variables**, añade (ver también `backend-vercel/.env.example`):

| Nombre | Valor |
|---|---|
| `BC_TENANT_ID` | Tu Tenant ID de Entra ID |
| `BC_CLIENT_ID` | Client ID de la App Registration |
| `BC_CLIENT_SECRET` | Client Secret de la App Registration |
| `BC_ITEMS_ENTITY_URL` | URL de OData de la página "Items" en BC |
| `BC_MANUFACTURERS_ENTITY_URL` | URL de OData de la página "Manufacturers" en BC |
| `BC_ITEM_CATEGORIES_ENTITY_URL` | URL de OData de la página "Item Categories" en BC |
| `ALLOWED_ORIGIN` | `https://tecmelec.github.io` |

Las URLs de OData se copian de **Business Central → Configuración → Web Services** (columna "URL de OData"), y tienen un formato como:
`https://api.businesscentral.dynamics.com/v2.0/<TENANT_ID>/Production/ODataV4/Company('<EMPRESA>')/Items`

La App Registration en Entra ID necesita permiso de **aplicación** (no delegado) `Dynamics 365 Business Central` con **lectura y escritura**, y el Client ID debe estar dado de alta como usuario de API dentro de Business Central con permission sets que permitan crear registros de Item.

Tras guardar las variables, vuelve a desplegar el proyecto (Vercel → Deployments → "Redeploy") para que las tome.

### 4. Réplica de búsqueda en Supabase (catálogo completo)

Para poder listar y buscar en **todo** el catálogo (no solo los últimos artículos) sin chocar con el límite de 10s de las funciones de Vercel en el plan gratuito, los productos se leen desde una réplica en Supabase, que se mantiene sincronizada con Business Central.

1. En tu proyecto de Supabase → **SQL Editor** → pega y ejecuta el contenido de `backend-vercel/supabase-schema.sql`.
2. En Supabase → **Project Settings → API**, copia la **URL del proyecto** y la **`service_role` key** (no la `anon` key — la `service_role` es la que tiene permisos de escritura desde el backend).
3. En Vercel → tu proyecto → **Environment Variables**, añade:

| Nombre | Valor |
|---|---|
| `SUPABASE_URL` | La URL de tu proyecto de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | La `service_role` key (nunca la compartas ni la pongas en el frontend) |

4. Redespliega el proyecto de Vercel.
5. En la app, como administrador, pulsa **"⇩ Sincronizar catálogo completo"** (arriba de la tabla de productos) para hacer la primera carga completa del catálogo. Las siguientes veces, cada alta nueva se refleja al instante, y puedes repetir la sincronización completa cuando quieras traer cambios hechos directamente en BC.

### 5. Conectar el frontend al backend

En **GitHub → Settings → Secrets and variables → Actions**, añade (o actualiza):

| Secret | Valor |
|---|---|
| `VITE_API_BASE_URL` | La URL de tu proyecto de Vercel, ej. `https://alta-productos-bc.vercel.app` |

Vuelve a lanzar el workflow "Deploy to GitHub Pages" (o haz un push) para que el frontend se reconstruya apuntando al backend.

## Desarrollo local

### Frontend
```bash
npm install
cp .env.local.example .env.local   # define VITE_API_BASE_URL=http://localhost:3000
npm run dev
```

### Backend
```bash
cd backend-vercel
npm install
cp .env.example .env   # rellena con tus valores reales
npx vercel dev          # requiere Vercel CLI (npm i -g vercel)
```

## Notas de seguridad

- Las credenciales de Business Central solo existen en las variables de entorno del proyecto de Vercel, nunca en el código ni en el navegador.
- `.env` / `.env.local` con valores reales **no se suben** al repo (ver `.gitignore`).
