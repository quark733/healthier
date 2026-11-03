#!/bin/bash
# Lägger till integritetssidan https://<din-adress>/privacy på servern.
# Körs en gång på servern:  bash add-privacy-page.sh
set -euo pipefail
cd /opt/healthier

read -rp "E-postadress att visa som kontakt på integritetssidan: " CONTACT
DOMAIN=$(grep '^DOMAIN=' .env | cut -d= -f2)
UPDATED=$(date +%Y-%m-%d)

cat > privacy.html <<EOF
<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Integritet – HealthCheck</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 680px; margin: 40px auto; padding: 0 16px; line-height: 1.6; color: #1f2328; background: #fff; }
  h1 { font-size: 1.6rem; } h2 { font-size: 1.15rem; margin-top: 1.8rem; }
  @media (prefers-color-scheme: dark) { body { color: #e6e6e6; background: #151515; } a { color: #8ab4f8; } }
</style>
</head>
<body>
<h1>Integritet för HealthCheck</h1>
<p>HealthCheck på ${DOMAIN} är en privat hälsodashboard för en familj. Den är inte en kommersiell tjänst och inte öppen för allmänheten. Endast inbjudna personer kan logga in.</p>

<h2>Vilka uppgifter som behandlas</h2>
<p>När du loggar in med Google och godkänner det hämtas hälsodata från ditt Google Health-konto: till exempel aktivitet, sömn, puls, vikt, kroppssammansättning och kost. Dessutom ditt namn, din e-postadress och din profilbild från Google.</p>

<h2>Varför</h2>
<p>Uppgifterna används enbart för att visa dig dina egna värden och trender i dashboarden. De används inte för reklam, säljs inte och delas inte med någon annan.</p>

<h2>Var de lagras</h2>
<p>Uppgifterna lagras på en server hos Hetzner i Tyskland (EU). Inloggningsnycklarna till Google lagras krypterade. Servern kontaktar inga andra tjänster än Googles API för att hämta din data.</p>

<h2>Hur länge</h2>
<p>Daglig historik sparas i upp till två år. Minutdata för puls sparas i 62 dagar.</p>

<h2>Ta bort dina uppgifter</h2>
<p>Under Inställningar → Konto i dashboarden kan du koppla bort ditt konto. Då raderas ditt konto och all lagrad data om dig. Du kan också återkalla åtkomsten i ditt Google-konto under Säkerhet → Tredjepartsappar.</p>

<h2>Kontakt</h2>
<p>Frågor om dina uppgifter: <a href="mailto:${CONTACT}">${CONTACT}</a></p>

<p><small>Senast uppdaterad ${UPDATED}.</small></p>
</body>
</html>
EOF

cat > Caddyfile <<'EOF'
{$DOMAIN} {
  encode gzip
  header Strict-Transport-Security "max-age=31536000"
  handle /privacy {
    root * /srv
    rewrite * /privacy.html
    file_server
  }
  handle {
    reverse_proxy app:3000
  }
}
EOF

if ! grep -q 'privacy.html' docker-compose.override.yml; then
  sed -i 's|      - ./Caddyfile:/etc/caddy/Caddyfile:ro|      - ./Caddyfile:/etc/caddy/Caddyfile:ro\n      - ./privacy.html:/srv/privacy.html:ro|' docker-compose.override.yml
fi
sed -i "s|^PRIVACY_URL=.*|PRIVACY_URL=https://${DOMAIN}/privacy|" .env

docker compose up -d --force-recreate caddy
echo "Klart. Öppna https://${DOMAIN}/privacy"
