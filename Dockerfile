FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
ARG APP_BUILD_ID=dev-build
ENV APP_BUILD_ID=$APP_BUILD_ID
COPY . .
RUN npm run build

FROM base AS runner
ARG APP_BUILD_ID=dev-build
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV APP_BUILD_ID=$APP_BUILD_ID
COPY --from=builder /app/package.json /app/package-lock.json /app/
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=builder /app/.next /app/.next
COPY --from=builder /app/app /app/app
COPY --from=builder /app/components /app/components
COPY --from=builder /app/hooks /app/hooks
COPY --from=builder /app/lib /app/lib
COPY --from=builder /app/providers /app/providers
COPY --from=builder /app/public /app/public
COPY --from=builder /app/scripts /app/scripts
COPY --from=builder /app/src /app/src
COPY --from=builder /app/store /app/store
COPY --from=builder /app/next.config.ts /app/next.config.ts
COPY --from=builder /app/next-env.d.ts /app/next-env.d.ts
COPY --from=builder /app/postcss.config.mjs /app/postcss.config.mjs
COPY --from=builder /app/tsconfig.json /app/tsconfig.json
EXPOSE 3000
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
