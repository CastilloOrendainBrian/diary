# Diario

Aplicación web para escribir notas organizadas por fecha y hora, como un diario personal.

Stack: Node.js 22+, TypeScript, Fastify, React, Vite, Tailwind CSS v4, PostgreSQL 16.

El plan completo de arquitectura y desarrollo está en [docs/PLAN.md](docs/PLAN.md).

## Requisitos

- Node.js 22 o superior
- npm
- Docker y Docker Compose (para PostgreSQL en desarrollo)

## Puesta en marcha (desarrollo)

```bash
# 1. Dependencias
npm install

# 2. Variables de entorno
cp .env.example .env

# 3. Base de datos de desarrollo (PostgreSQL en 127.0.0.1:5433)
docker compose -f docker-compose.dev.yml up -d

# 4. Servidor (3000) y cliente Vite (5173) en paralelo
npm run dev
```

Abrir <http://localhost:5173>. Las llamadas a `/api` se redirigen al servidor Fastify.

## Scripts

| Script                 | Función                                                    |
| ---------------------- | ---------------------------------------------------------- |
| `npm run dev`          | Servidor (tsx watch) y cliente (Vite) en paralelo          |
| `npm run dev:server`   | Sólo el servidor Fastify                                   |
| `npm run dev:client`   | Sólo el cliente Vite                                       |
| `npm run build`        | Compila cliente (`dist/client`) y servidor (`dist/server`) |
| `npm start`            | Arranca el servidor compilado                              |
| `npm run typecheck`    | Comprobación de tipos con `tsc`                            |
| `npm run lint`         | ESLint                                                     |
| `npm run format`       | Prettier (escritura)                                       |
| `npm run format:check` | Prettier (sólo comprobación)                               |
| `npm test`             | Vitest                                                     |

## Estructura

```
src/
  server/   Backend Fastify (config, app, routes, services, db, mail)
  client/   Frontend React + Tailwind (SPA)
  shared/   Código compartido entre servidor y cliente
tests/      Unit, integration and e2e tests
docs/       Documentación del proyecto
```

## Convenciones

- Código, comentarios, nombres técnicos y mensajes de commit en inglés.
- Textos visibles para el usuario en español, mediante i18n.
- Documentación en `docs/` en español.
