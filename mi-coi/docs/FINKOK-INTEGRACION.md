# Integración Finkok (timbrado CFDI)

Este proyecto usa el servicio SOAP de Finkok para timbrar facturas (CFDI 4.0). La configuración se lee de `config_instituto.json` en la raíz del proyecto.

## Referencia: Manual de usuario

**Manual:** FINKOKFACTURACION-MANUAL.pdf (Finkok Facturación).

Resumen de secciones útiles:

| Sección | Contenido |
|--------|-----------|
| **3–4** | Registro y asistente (activar cuenta, datos fiscales, CSD). |
| **8** | **Receptores (clientes):** agregar/editar Persona Moral, Física o Extranjero. El receptor de la factura debe estar dado de alta en Finkok. |
| **9** | Productos/servicios: claves SAT (catCFDI, c_ClaveProdServ, c_ClaveUnidad). |
| **11** | Crear factura 3.3 en el portal; impuestos y complementos. |
| **15** | **Preferencias Fiscales:** subir Certificado (CSD), cambio de régimen fiscal. Los datos del emisor en el XML deben coincidir con los Datos Fiscales del perfil en Finkok. |
| **17** | Numeración de facturas (serie, folio). |
| **20** | Contacto: soporte@finkok.com, facturacion.finkok.com. |

## Configuración en `config_instituto.json`

- **FINKOK_USER / FINKOK_PASSWORD:** usuario y contraseña del portal (demo-facturacion.finkok.com o facturacion.finkok.com).
- **FINKOK_ISSUER_RFC, FINKOK_ISSUER_NAME, FINKOK_LUGAR_EXPEDICION, FINKOK_REGIMEN:** datos del **emisor** del CFDI. Deben ser el RFC que en Finkok tiene **timbres asignados** (el que aparece en la lista de clientes con columna TIMBRES). Si se cambia a otro RFC que no tenga timbres, Finkok devolverá error 300 o 705 y no timbrará.
- **FINKOK_SANDBOX:** Vinculación con modo de pruebas. `true` = **modo pruebas** (demo, URL: demo-facturacion.finkok.com); `false` = **producción** (facturacion.finkok.com). La app usa la URL según este valor; no se eliminó esa vinculación.
- **FINKOK_USER_ALTERNATIVO / FINKOK_PASSWORD_ALTERNATIVO:** cuenta alternativa si la principal falla al timbrar.

## Botones en pantalla Factura (estilo Aspel COI / manual Finkok)

En Módulo SAT → pestaña Factura:

- **Agregar línea:** agrega un concepto (descripción, cantidad, valor unit., clave prod., unidad) a la tabla.
- **Eliminar línea:** elimina la línea seleccionada en la tabla de conceptos.
- **Ver antes de imprimir:** abre una ventana con la vista previa de la factura (receptor, conceptos, subtotal, IVA, total).
- **TIMBRAR FACTURA:** envía la factura al PAC (Finkok).
- **Descargar XML de esta factura:** guarda el XML timbrado de la última factura exitosa.
- **Guardar XML sin timbrar:** visible cuando el timbrado falla (ej. error 705); guarda el XML generado sin sello para revisión o soporte.
- **Abrir carpeta facturas timbradas:** abre la carpeta donde se guardan los XML.

## Emisor vs receptor

- **Emisor:** quien expide la factura (tu perfil o institución). Debe estar en Preferencias Fiscales / Datos Fiscales y, en producción, con CSD subido.
- **Receptor:** el cliente a quien se le factura. Debe estar dado de alta en Receptores en Finkok (sección 8 del manual).

## Códigos de error frecuentes (timbrado)

| Código | Significado | Qué hacer |
|--------|-------------|-----------|
| **702** | Usuario o contraseña incorrectos | Revisar FINKOK_USER y FINKOK_PASSWORD en config_instituto.json. |
| **705** | Usuario inactivo o sin timbres disponibles | Comprar timbres o activar la cuenta en el portal Finkok (facturacion.finkok.com o demo). |
| **300** | RFC del emisor no dado de alta en Finkok | En el portal agregar el emisor como cliente y subir CSD, o usar en config un RFC que ya esté en Finkok. |

## Enlaces

- Portal demo: https://demo-facturacion.finkok.com  
- Portal producción: https://facturacion.finkok.com  
- Servicio SOAP stamp (demo): https://demo-facturacion.finkok.com/servicios/soap/stamp  
- **Wiki Finkok (timbrado):**
  - Método stamp: https://wiki.finkok.com/home/webservices/ws_timbrado/metodo_stamp  
  - Respuesta correcta (envoltura SOAP): metodo_stamp#envoltura-soapresponse-respuesta-correcta  
  - Respuesta incorrecta (envoltura SOAP): metodo_stamp#envoltura-soapresponse-respuesta-incorrecta  
  - Sign_stamp: https://wiki.finkok.com/home/webservices/ws_timbrado/Sign_stamp  
  - Crear token (panel): https://wiki.finkok.com/en/home/crear-token-panel  

La app intenta **sign_stamp** y, si hace falta, **stamp**. El response trae el XML ya timbrado; el sistema lo guarda en `facturas_timbradas/` de forma automática.

## Respuesta de soporte Finkok (flujo)

1. **Vigencia:** No hay límite de tiempo del motor de timbrado; en producción depende de los folios adquiridos.  
2. **Recepción:** Usar el método **sign_stamp** o **stamp**; el sistema devuelve en el response el XML ya timbrado para guardarlo en la carpeta que usted defina (esta app lo guarda en `facturas_timbradas/`).  
3. **Flujo:** Usted envía el XML (CFDI), Finkok le agrega el timbre fiscal, lo envía al SAT y le devuelve a usted el XML timbrado para su copia.

Última actualización según manual Finkok, wiki y perfil emisor del proyecto.
