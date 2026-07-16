# Use the official Bun image
FROM oven/bun:1.1-alpine AS base
WORKDIR /usr/src/app

# Install dependencies into a temporary image
FROM base AS install
RUN mkdir -p /temp/prod
COPY package.json bun.lockb /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# Build the application
FROM base AS prerelease
COPY --from=install /temp/prod/node_modules node_modules
COPY . .
# Bundle the app into a single file
RUN bun build ./src/index.ts --target=bun --outdir=./dist

# Run image
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/dist/index.js ./index.js
COPY --from=prerelease /usr/src/app/package.json .

# Run the app
USER bun
EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "run", "./index.js" ]
