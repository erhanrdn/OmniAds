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
COPY --from=builder /app /app
EXPOSE 3000
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
