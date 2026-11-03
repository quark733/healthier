#!/bin/bash
# Låter servern köra koden från din egen fork i stället för den färdiga
# originalversionen. Servern hämtar koden från GitHub och bygger den själv.
# Körs en gång på servern:  bash use-fork.sh
# Efter det uppdaterar du med:  bash /opt/healthier/update.sh
set -euo pipefail
cd /opt/healthier

REPO="${REPO:-https://github.com/quark733/healthier.git}"
BRANCH="${BRANCH:-main}"

command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq git; }

if [ -d src/.git ]; then
  git -C src fetch -q origin "$BRANCH"
  git -C src checkout -q "$BRANCH"
  git -C src reset -q --hard "origin/$BRANCH"
else
  git clone -q --branch "$BRANCH" "$REPO" src
fi

# En egen tilläggsfil: appen byggs från ./src och hämtas aldrig från nätet.
cat > docker-compose.local.yml <<'EOF'
services:
  app:
    image: healthcheck-local:latest
    pull_policy: build
    build:
      context: ./src
EOF

# Compose läser alla tre filerna, även för backupjobbet, eftersom .env pekar ut dem.
if grep -q '^COMPOSE_FILE=' .env; then
  sed -i 's|^COMPOSE_FILE=.*|COMPOSE_FILE=docker-compose.yml:docker-compose.override.yml:docker-compose.local.yml|' .env
else
  echo 'COMPOSE_FILE=docker-compose.yml:docker-compose.override.yml:docker-compose.local.yml' >> .env
fi

cat > update.sh <<'EOF'
#!/bin/bash
# Hämtar senaste koden från din fork, bygger och startar om appen.
set -euo pipefail
cd /opt/healthier
git -C src fetch -q origin main
git -C src reset -q --hard origin/main
echo "Bygger version $(git -C src log -1 --format='%h %s')"
docker compose build app
docker compose up -d
docker image prune -f >/dev/null
echo "Klart."
EOF
chmod 700 update.sh

echo "Bygger appen från din fork. Det tar 3–8 minuter första gången."
docker compose build app
docker compose up -d
docker image prune -f >/dev/null
echo "Klart. Servern kör nu: $(git -C src log -1 --format='%h %s')"
