## FICHA DE CHEQUEO (para el "de acuerdo" de Raul)
- **Qué:** Revisar, commitear y pushear los 4 cambios locales a mramirezraul71/rauli-app (repo público).
- **Por qué:** Cambios desde marzo sin resguardar; al ser repo público hay que verificar que no haya secretos antes del push.
- **Riesgos:** Bajo-medio — push a repo PÚBLICO: si `modules/` o el diff trajeran una clave quedaría expuesta (mitigación: escaneo de secretos antes del push; probabilidad baja, impacto alto).
- **Costo:** $0 · ~20 min.
- **Rollback:** `git revert` del commit si algo sale mal.
- **Necesito de ti:** (vacío — solo tu "de acuerdo"; te muestro el diff antes del push).

# PLAN DE MEDIDAS — D:\rauli-app-src
> Documento de planificación · Fase 2 auditoría 2026-10-01.
> NINGUNA medida se ejecuta sin el OK explícito de Raul.

## Medidas propuestas (por prioridad)
1. **M1 — Escaneo de secretos.** Revisar el diff de `index.html`/`sw.js` y el contenido de `modules/` por claves, tokens o URLs privadas (el remoto es público).
2. **M2 — Limpieza y commit.** Borrar `.tmp-index-script.js`; commit de `index.html`, `sw.js` y `modules/` si pasan el escaneo; push a `origin main` (hoy IGUAL en f7ed5b9).

## Requieren aprobación de Raul
- M2: commit + push al repo **público** (te muestro el diff antes).
- Confirmar que `modules/` puede publicarse.

## Verificación
- GitHub `rauli-app` main = nuevo commit (distinto de f7ed5b9).
- `git status` limpio en D:\rauli-app-src.
- Escaneo de secretos sin hallazgos (reporte en el expediente).
