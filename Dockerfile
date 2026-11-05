FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN ONNXRUNTIME_NODE_INSTALL=skip npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# package.json keeps dist/boot.js in ESM mode. The server bundle already
# contains its runtime dependencies, so no second npm install is needed.
COPY package.json ./
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/boot.js"]
