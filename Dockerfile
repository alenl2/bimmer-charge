FROM node:latest

ARG BUILD_VERSION=0.0.0

# Create app directory
WORKDIR /app

COPY package.json ./
COPY yarn.lock ./

RUN yarn install --production
RUN npm version "$BUILD_VERSION"

# Bundle app source
COPY . .
RUN yarn build

EXPOSE 3000
USER root
ENTRYPOINT [ "yarn", "server" ]