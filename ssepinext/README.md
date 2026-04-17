# SSEPI-NEXT Data Viewer

Aplicación de escritorio para ver los datos del ERP SSEPI desde una aplicación nativa.

## Características

- 📊 **Dashboard** con métricas en tiempo real
- 🛒 **Ventas** - Ver todas las cotizaciones y órdenes de venta
- 🔧 **Taller** - Órdenes de servicio del taller
- ⚙️ **Motores** - Órdenes de servicio de motores
- 🤖 **Automatización** - Proyectos de automatización
- 📦 **Inventario** - Productos y stock
- 👥 **Contactos** - Clientes y proveedores

## Instalación

1. **Instalar dependencias:**
   ```bash
   cd ssepinext
   npm install
   ```

2. **Configurar Supabase:**
   - Copia `.env.example` a `.env`
   - Edita `.env` y agrega tus credenciales de Supabase (las mismas que usa el ERP web)

3. **Actualizar renderer.js:**
   Abre `renderer.js` y reemplaza:
   ```javascript
   const SUPABASE_URL = 'https://tu-proyecto.supabase.co';
   const SUPABASE_ANON_KEY = 'tu-anon-key';
   ```
   Con tus credenciales reales de `panel/js/core/supabase-client.js`

## Uso

### Desarrollo
```bash
npm start
```

### Producción (build)
```bash
npm run build
```

## Conexión con el ERP Web

SSEPI-NEXT se conecta **directamente a la misma base de datos Supabase** que el ERP web, por lo que:

- ✅ Los datos son los mismos en tiempo real
- ✅ No se necesita configuración adicional del servidor
- ✅ Los cambios en el ERP web se reflejan al refrescar (F5 o botón Actualizar)

## Exportar Datos

Cada módulo tiene un botón **Exportar** que descarga los datos en formato CSV.

## Requisitos

- Node.js 18+
- Credenciales de Supabase del proyecto SSEPI
