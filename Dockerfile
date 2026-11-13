# Build stage: compile TypeScript and install production-less tree (zero runtime deps).
FROM node:22-alpine AS builder
WORKDIR /build
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm install --no-audit --no-fund && npm run build

# Runtime stage: zero runtime dependencies, only dist + static + examples are needed.
FROM node:22-alpine
WORKDIR /app
RUN addgroup -S feedbackproof && adduser -S feedbackproof -G feedbackproof
COPY --from=builder /build/package.json ./package.json
COPY bin ./bin
COPY dist ./dist
COPY static ./static
COPY examples ./examples
USER feedbackproof
ENV PORT=8788
ENV HOST=0.0.0.0
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8788)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/cli.js", "serve"]
