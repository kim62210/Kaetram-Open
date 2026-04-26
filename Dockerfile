FROM node:20-alpine

RUN apk add --no-cache git python3 make g++ bash wget \
    && corepack enable

WORKDIR /app

COPY . .

RUN HUSKY=0 yarn install --immutable \
    && yarn build

ENV NODE_ENV=production

EXPOSE 9000 9001

CMD ["yarn", "start"]
