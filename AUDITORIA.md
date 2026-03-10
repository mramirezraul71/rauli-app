# Auditoría RAULI Lite Dashboard

Fecha: 2026-03-09
Base visual consolidada: `C:\C_RAULI\RAULI_DESKTOP\app\index.html`
Repo operativo: `C:\rauli-app-src`

## Decisión de base
Se adoptó la estructura visual madura del dashboard RAULI por ser más simple para túnel, móvil y usuarios con poca experiencia. Se descartó mantener el dashboard ligero original del repo como base visual porque estaba demasiado incompleto.

## Ajustes aplicados
- Conservada la línea visual original, colores y layout general.
- Eliminados residuos de `Orlandito` y del rol `supervisor` en la superficie operativa.
- Eliminados roles y PIN de la versión ligera para reducir altura y complejidad en móvil.
- Home compactado a dos bloques principales: asistente e inventario primario.
- Conversación visible limitada a las 3 interacciones más recientes.
- Sustituida la lógica de finanzas/amortización por inventario y cadena primaria de eventos.
- Integrada sincronización real hacia el backend puente `api/lite` para surtir la app compacta de Panadería en ATLAS.
- Integrada IA híbrida:
  - flujo guiado local para entrada a almacén, venta, salida a producción, alerta y cierre de caja
  - puente a ATLAS para consultas generales
  - fallback local cuando ATLAS no responde
- Corregidos problemas de codificación UTF-8 / mojibake en la UI activa.
- Corregido el orden de `API_BASES` para que en preview local use primero `127.0.0.1:3001` y no el puerto del frontend.
- Añadido `version.json` y actualización de caché en `sw.js`.
- `rauli.html` convertido en redirect limpio a `index.html`.
- `manifest.json` normalizado a UTF-8.

## Backend puente validado
Ruta activa: `C:\ATLAS_PUSH\_external\rauli-panaderia\backend\routes\lite.js`
Endpoints verificados:
- `GET /api/lite/status`
- `GET /api/lite/catalog`
- `POST /api/lite/chat`
- `POST /api/lite/sync`

## Pruebas realizadas
- Carga completa del dashboard en navegador real.
- Inicio sin sesión ni PIN.
- Navegación compacta móvil.
- Registro guiado de entrada a almacén.
- Registro manual de venta.
- Registro manual de salida a producción.
- Sincronización manual y automática.
- Consulta general al asistente con fallback funcional.
- Verificación del catálogo operativo cargado desde ATLAS.

## Estado final
Aprobado para uso como dashboard ligero vinculado a ATLAS y a la app compacta de Panadería, enfocado en capturar información primaria con una interfaz corta y estable para móvil.
