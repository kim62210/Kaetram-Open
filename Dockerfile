FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        git python3 make g++ build-essential ca-certificates wget pkg-config \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /app

COPY . .

RUN HUSKY=0 yarn install --immutable \
    && yarn build

ENV NODE_ENV=production

EXPOSE 9000 9001

CMD ["yarn", "start"]
