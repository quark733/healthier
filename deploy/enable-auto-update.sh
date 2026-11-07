#!/bin/bash
# Slår på nattlig automatisk uppdatering av HealthCheck. Kör en gång på servern:
#   bash /opt/healthier/src/deploy/enable-auto-update.sh
#
# Varje natt kl. 04.30 (svensk tid) kollar servern om forken har ny kod. Finns det ny kod byggs
# appen och startas om. Om bygget misslyckas fortsätter den gamla versionen att köra, och servern
# försöker igen nästa natt. Logg: journalctl -u healthier-update
# Stäng av:  systemctl disable --now healthier-update.timer
set -euo pipefail
cd /opt/healthier
[ -x update.sh ] || { echo "Hittar inte /opt/healthier/update.sh. Kör deploy/use-fork.sh först."; exit 1; }

cat > auto-update.sh <<'SH'
#!/bin/bash
# Bygger bara om när forken har en version som inte redan körs.
set -euo pipefail
cd /opt/healthier
git -C src fetch -q origin main
latest="$(git -C src rev-parse origin/main)"
running="$(cat .deployed 2>/dev/null || true)"
if [ "$latest" = "$running" ]; then
  echo "Redan senaste versionen ($(git -C src log -1 --format='%h %s' "$latest"))."
  exit 0
fi
bash /opt/healthier/update.sh
echo "$latest" > .deployed
SH
chmod 700 auto-update.sh

# Det som körs nu räknas som utrullat, så första natten bygger bara om det finns något nytt.
git -C src rev-parse HEAD > .deployed

cat > /etc/systemd/system/healthier-update.service <<'UNIT'
[Unit]
Description=HealthCheck: hämta och bygg ny version från forken
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/healthier/auto-update.sh
UNIT

cat > /etc/systemd/system/healthier-update.timer <<'UNIT'
[Unit]
Description=HealthCheck: nattlig uppdatering

[Timer]
OnCalendar=*-*-* 04:30:00 Europe/Stockholm
Persistent=true
RandomizedDelaySec=10min

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now healthier-update.timer
echo "Klart. Nästa körning:"
systemctl list-timers healthier-update.timer --no-pager | sed -n 2p
