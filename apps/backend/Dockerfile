# The backend's image, which Cloud Run runs. Build it with `pnpm build:image`
# in apps/backend, which builds from the repo root, since pnpm installs from
# the whole workspace's lockfile.
#
# The first stage installs the backend's dependencies and bundles
# src/server.ts and everything it imports into one file with esbuild. The
# second puts only that file on a bare Node, so the image holds no source, no
# node_modules and no pnpm. Dockerfile.dockerignore lists what the build sees.

# The Node that .mise.toml pins. Change both together.
FROM node:24.21.0-slim AS build

# The pnpm that .mise.toml pins. Corepack can't start pnpm 12 (see ci.yml).
RUN npm install --global pnpm@12.5.1

WORKDIR /repo

# The manifests and the lockfile first, so Docker reuses the installed
# dependencies until one of them changes. --frozen-lockfile installs exactly
# what pnpm-lock.yaml says, under the rules in pnpm-workspace.yaml.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile --filter @geekykey/backend

COPY apps/backend/ apps/backend/
RUN pnpm --filter @geekykey/backend build

FROM node:24.21.0-slim

WORKDIR /app
COPY --from=build /repo/apps/backend/dist/ ./

# Not root, so the server can't change the image's own files.
USER node

# The settings are environment variables: Cloud Run sets PORT itself, and the
# rest come from the service's settings and Secret Manager. The source map
# puts the TypeScript file and line in a logged error's stack trace.
CMD ["node", "--enable-source-maps", "server.cjs"]
