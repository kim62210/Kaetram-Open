FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        git python3 make g++ build-essential ca-certificates wget pkg-config \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /app

COPY . .

# Astro 클라이언트는 빌드 타임에 ACCEPT_LICENSE/CLIENT_REMOTE_HOST 등을
# globalConfig 정적 자산에 박는다. .env를 빌드 직전에 생성한다.
# (런타임 .env volume 마운트는 server 설정에만 효과 있음)
RUN cp .env.defaults .env \
    && sed -i 's|^ACCEPT_LICENSE=false|ACCEPT_LICENSE=true|' .env \
    && sed -i 's|^HOST=.*|HOST=0.0.0.0|' .env \
    && sed -i 's|^SSL=false|SSL=true|' .env \
    && sed -i 's|^SKIP_DATABASE=.*|SKIP_DATABASE=true|' .env \
    && sed -i 's|^CLIENT_REMOTE_HOST=.*|CLIENT_REMOTE_HOST=kaetram-ws.brian-dev.cloud|' .env

RUN HUSKY=0 yarn install --immutable \
    && yarn build

ENV NODE_ENV=production

EXPOSE 9000 9001

CMD ["yarn", "start"]
