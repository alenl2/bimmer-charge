FROM node:lts-alpine

RUN apk add --update alpine-sdk bash

ENV PYTHONUNBUFFERED=1
RUN apk add --update --no-cache python3 && ln -sf python3 /usr/bin/python
RUN python3 -m ensurepip
RUN pip3 install --no-cache --upgrade pip setuptools

RUN pip3 install --upgrade bimmer_connected

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