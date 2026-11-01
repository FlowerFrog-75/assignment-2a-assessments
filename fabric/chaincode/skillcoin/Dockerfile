# Skillcoin chaincode, run as a service (Fabric "chaincode as a service").
# Each peer connects to it at the address in its chaincode package.
FROM node:20-alpine AS build
WORKDIR /usr/src/chaincode
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --no-audit --no-fund
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /usr/src/chaincode
COPY --from=build /usr/src/chaincode/package.json ./
COPY --from=build /usr/src/chaincode/node_modules ./node_modules
COPY --from=build /usr/src/chaincode/dist ./dist
USER node
EXPOSE 9999
# CHAINCODE_SERVER_ADDRESS and CHAINCODE_ID are set in fabric/docker-compose.yaml.
CMD ["npm", "start"]
