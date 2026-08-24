# ALTA PRODUCTOS BC

Aplicación web para el alta y gestión de productos, con datos **compartidos entre todos los usuarios** y sincronización con **Business Central** (Items, Manufacturers, Item Categories) vía OData.

- App web: https://tecmelec.github.io/ALTA-PRODUCTOS-BC/
- Frontend: React + Vite, desplegado en GitHub Pages.
- Backend: Azure Functions (Node/TypeScript), guarda los datos compartidos en Azure Table Storage y se conecta a Business Central.

View your app in AI Studio: https://ai.studio/apps/27a86971-9c09-4e37-a11c-b811e8928709

```
Navegador (todos los usuarios)
        │  HTTPS
        ▼
GitHub Pages (frontend estático)
        │  fetch a /api/...
        ▼
Azure Functions (backend)
        │                         │
        ▼                         ▼
Azure Table Storage        Business Central OData
(productos compartidos)    (Items / Manufacturers / ItemCategories)
```

El frontend **nunca** habla directamente con Business Central: todas las credenciales
(Tenant ID, Client ID, Client Secret) viven solo en la configuración del backend en Azure.

## Puesta en marcha del backend (Azure)

### 1. Crear los recursos en Azure Portal

1. **Storage Account** (SKU Standard LRS, cualquier región cercana).
2. **Function App**:
   - Runtime stack: **Node.js 20**
   - Sistema operativo: Linux
   - Plan: Consumption (gratis para este volumen de uso)
   - Vincúlala al Storage Account creado en el paso 1.

### 2. Configurar variables de entorno (App Settings) en la Function App

En **Function App → Configuración → Variables de entorno**, añade:

| Nombre | Valor |
|---|---|
| `BC_TENANT_ID` | Tu Tenant ID de Entra ID |
| `BC_CLIENT_ID` | Client ID de la App Registration |
| `BC_CLIENT_SECRET` | Client Secret de la App Registration |
| `BC_ENVIRONMENT` | `Production` |
| `BC_COMPANY_ID` | Nombre o GUID de la empresa en BC |
| `BC_ITEMS_ENTITY_URL` | `https://api.businesscentral.dynamics.com/v2.0/<TENANT_ID>/Production/ODataV4/Company('<EMPRESA>')/Items` |
| `BC_MANUFACTURERS_ENTITY_URL` | Igual que arriba pero terminando en `/Manufacturers` |
| `BC_ITEM_CATEGORIES_ENTITY_URL` | Igual que arriba pero terminando en `/ItemCategories` |
| `ALLOWED_ORIGIN` | `https://tecmelec.github.io` |
| `AZURE_STORAGE_CONNECTION_STRING` | Cadena de conexión del Storage Account (Storage Account → Claves de acceso) |

> Los nombres exactos de los endpoints OData dependen de cómo estén publicadas las páginas
> "Items", "Manufacturers" e "Item Categories" en **Business Central → Configuración → Web Services**.
> Copia ahí la URL de OData V4 exacta de cada uno.

La App Registration en Entra ID necesita permiso de API `Dynamics 365 Business Central` (Application permission, tipo `API.ReadWrite.All` o el que use tu organización) con consentimiento de administrador concedido, y el usuario/aplicación debe tener también permisos dentro de Business Central (Configuración > Usuarios > asignar el Client ID como usuario de API con los permission sets adecuados).

### 3. Desplegar el código del backend

Opción recomendada: GitHub Actions (ya incluido en este repo, `.github/workflows/deploy-backend.yml`).

En **GitHub → Settings → Secrets and variables → Actions**, añade:

| Secret | Valor |
|---|---|
| `AZURE_FUNCTIONAPP_NAME` | Nombre de tu Function App en Azure |
| `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` | Perfil de publicación (Function App → Overview → "Get publish profile", pega el XML completo) |

Cada vez que hagas push a `main` tocando algo en `/backend`, se desplegará automáticamente.

### 4. Conectar el frontend al backend

En **GitHub → Settings → Secrets and variables → Actions**, añade:

| Secret | Valor |
|---|---|
| `VITE_API_BASE_URL` | URL pública de tu Function App, ej. `https://tu-function-app.azurewebsites.net` |

Vuelve a lanzar el workflow "Deploy to GitHub Pages" (o haz un push) para que el frontend se reconstruya apuntando al backend.

### 5. Sincronizar con Business Central

- **Manual**: botón "⟳ Sincronizar con BC" en la app, o `POST https://tu-function-app.azurewebsites.net/api/sync`.
- **Automática**: la función `syncScheduled` corre cada noche a las 03:00 UTC.

## Desarrollo local

### Frontend
```bash
npm install
cp .env.local.example .env.local   # define VITE_API_BASE_URL=http://localhost:7071
npm run dev
```

### Backend
```bash
cd backend
npm install
cp local.settings.json.example local.settings.json   # rellena con tus valores reales
npm run build
npm start   # requiere Azure Functions Core Tools instalado
```

## Notas de seguridad

- `local.settings.json` y cualquier `.env.local` con valores reales **no se suben** al repo (ver `.gitignore`).
- Las credenciales de Business Central solo existen en la configuración de la Function App en Azure, nunca en el código ni en el navegador.
