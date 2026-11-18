# HANDOFF — Prompt para abrir en la cuenta de Claude nueva

Copia TODO el bloque de abajo (desde `---BEGIN---` hasta `---END---`, sin incluir esos marcadores) y pégalo como primer mensaje en la nueva sesión de Claude Code. Esto le da contexto completo del proyecto en un solo movimiento.

---BEGIN---

Hola. Vengo de otra cuenta de Claude donde ya habíamos avanzado en este proyecto. Necesito que te pongas al día antes de seguir trabajando. Para eso:

1. Lee `CLAUDE.md` en la raíz del proyecto — tiene todo el contexto técnico (arquitectura, peculiaridades por scraper, endpoints, flujo de deploy, gotchas).
2. Lee `README.md` — descripción general y pasos de arranque.
3. Revisa `git log --oneline -20` para ver qué se ha hecho recientemente.

**Lo esencial que debes saber de entrada:**

- Es un scraper + landing web para catálogos de tres agencias de viajes (Muntania, Baobabnature, Kannak). Proyecto personal, no comercial.
- Stack: Node 20 + Express + Playwright (para Kannak) + Cheerio (para los otros dos) + vanilla JS en el front.
- Repo: https://github.com/Lesbeziers/PLANETA40-SCRAPPER
- Web en producción: https://planeta40-scrapper.onrender.com (auto-deploy desde `main`, Render free tier)
- Para arrancar en local: `npm install && npm start`, abrir `http://localhost:3000`. **No uses Live Server** — necesita el backend Express.
- Si no tienes Node instalado: hay instrucciones en el README para una instalación portable en `~/.local/` sin permisos de admin (es mi caso).

**Mis preferencias de trabajo** (consolidadas de sesiones previas):

- Respuestas en español, concisas y directas. Nada de rollos innecesarios.
- Estructura de carpetas para proyectos web: `assets/{js,css,img,fonts}` (ya la sigue este proyecto).
- Prefiero que me preguntes antes de acciones irreversibles o que afecten al repo público (commits, push, deploys).
- El estilo de commits de este repo es corto y en español, tipo: `"Rediseno de landing: tipografia Apercu, azul de marca y cabecera nueva"`.
- Attribution esperada en commits:
  ```
  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  ```

**Dónde está todo:**

- Carpeta de trabajo: `/Users/grafismoiptvmb5/Desktop/MATIAS/PLANETA 40/PROYECTO V0.1` (puede haber copias en otras rutas del disco; la única que importa es la que tiene `.git` apuntando al remoto de arriba).
- Node portable (si está instalado): `~/.local/node-v20.18.1-darwin-x64/bin/` (ya en el PATH vía `~/.zshrc`).

**Último estado antes de este handoff:**

- Último commit: `df39815 Formatear precios en la tabla como "1.390 €"` (ya desplegado).
- Working tree limpio, nada pendiente.
- La web funciona en producción.

**Posibles siguientes pasos** (ideas no comprometidas, de la lista en `CLAUDE.md`):

- Enriquecer Kannak visitando cada ficha para sacar itinerario/incluye/etc.
- Mejorar detección de destino (hoy lista hardcodeada).
- Añadir paginación en escaneos por URL.
- Limpiar el endpoint `/api/scan` que está deprecado.

Confirma que has leído `CLAUDE.md` y `README.md` y dime qué quieres que haga a continuación.

---END---

## Notas adicionales (NO van en el prompt)

- Si en la nueva cuenta no tienes el Node portable instalado, el README tiene las instrucciones.
- El `git config` del repo local sigue a nombre de `Lesbeziers / matias.cortina@gmail.com`. Si vas a hacer commits desde la cuenta nueva pero quieres que sigan saliendo con tu identidad personal, no necesitas tocar nada — el `git config user.name` y `user.email` del repo son independientes de la cuenta de Claude.
- La autenticación con GitHub para `git push` usa las credenciales guardadas en el llavero de macOS (Keychain), que son tuyas y no cambian al cambiar de cuenta de Claude.
