#!/usr/bin/env bash
# EC2 user-data for a single-server PREVIEW of ResearchDesk Pro (Ubuntu 24.04,
# x86_64, ≥4 GB RAM, ≥30 GB disk). Runs the local Supabase stack in Docker,
# the Next.js production build in preview mode, and Caddy on port 80.
#
# Preview only: Supabase's local stack uses its well-known demo JWT secret,
# there is no TLS, and payments go through the sandbox gateway. Restrict the
# security group to your own IP and never put real customer data here.
#
# Progress: /var/log/researchdesk-bootstrap.log; success marker:
# /opt/researchdesk/READY.
set -euxo pipefail
exec > >(tee -a /var/log/researchdesk-bootstrap.log) 2>&1

REPO_URL="${REPO_URL:-https://github.com/alharbimanea/pentagi.git}"
REPO_BRANCH="${REPO_BRANCH:-claude/vigilant-hypatia-il5qax}"
APP_DIR=/opt/researchdesk/app
APP_USER=researchdesk

export DEBIAN_FRONTEND=noninteractive

# The Supabase stack plus a Next.js build do not fit in 4 GB without swap.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

apt-get update
apt-get install -y ca-certificates curl git gnupg openssl docker.io debian-keyring debian-archive-keyring apt-transport-https
systemctl enable --now docker

curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"
usermod -aG docker "$APP_USER"
mkdir -p /opt/researchdesk && chown "$APP_USER:$APP_USER" /opt/researchdesk

TOKEN=$(curl -sX PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 300")
PUBLIC_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
ORIGIN="http://${PUBLIC_IP}"

sudo -iu "$APP_USER" bash -eux <<EOF
rm -rf /opt/researchdesk/repo
git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" /opt/researchdesk/repo
ln -sfn /opt/researchdesk/repo/researchdesk-pro "$APP_DIR"
cd "$APP_DIR"
sed -i 's#^site_url = .*#site_url = "${ORIGIN}"#' supabase/config.toml
sed -i 's#^additional_redirect_urls = .*#additional_redirect_urls = ["${ORIGIN}/auth/callback"]#' supabase/config.toml
npm ci --no-audit --no-fund
npx -y supabase@2.33.9 status >/dev/null 2>&1 || npx -y supabase@2.33.9 start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta
EOF

cd "$APP_DIR"
STATUS=$(sudo -iu "$APP_USER" bash -c "cd $APP_DIR && npx -y supabase@2.33.9 status -o env")
ANON_KEY=$(echo "$STATUS" | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')
SERVICE_KEY=$(echo "$STATUS" | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')
test -n "$ANON_KEY" && test -n "$SERVICE_KEY"

cat > "$APP_DIR/.env.production.local" <<EOF
APP_STAGE=preview
NEXT_PUBLIC_SITE_URL=${ORIGIN}
NEXT_PUBLIC_SUPABASE_URL=${ORIGIN}
SUPABASE_INTERNAL_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_KEY}
PAYMENTS_SANDBOX_ENABLED=true
SANDBOX_WEBHOOK_SECRET=$(openssl rand -hex 24)
CRON_SECRET=$(openssl rand -hex 24)
IP_HASH_SALT=$(openssl rand -hex 16)
EOF
chown "$APP_USER:$APP_USER" "$APP_DIR/.env.production.local"
chmod 600 "$APP_DIR/.env.production.local"

sudo -iu "$APP_USER" bash -c "cd $APP_DIR && NEXT_TELEMETRY_DISABLED=1 npm run build"

cat > /etc/systemd/system/researchdesk-supabase.service <<EOF
[Unit]
Description=ResearchDesk Supabase stack
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=${APP_USER}
WorkingDirectory=${APP_DIR}
ExecStart=/bin/sh -c '/usr/bin/npx -y supabase@2.33.9 status >/dev/null 2>&1 || /usr/bin/npx -y supabase@2.33.9 start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta'
ExecStop=/usr/bin/npx -y supabase@2.33.9 stop
TimeoutStartSec=900

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/researchdesk-web.service <<EOF
[Unit]
Description=ResearchDesk Next.js
After=researchdesk-supabase.service
Requires=researchdesk-supabase.service

[Service]
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
ExecStart=/usr/bin/npx next start -H 127.0.0.1 -p 3000
Restart=always

[Install]
WantedBy=multi-user.target
EOF

cp "$APP_DIR/deploy/aws-preview/Caddyfile" /etc/caddy/Caddyfile
mkdir -p /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironment=SITE_ADDRESS=:80\n' > /etc/systemd/system/caddy.service.d/site.conf

systemctl daemon-reload
systemctl enable researchdesk-supabase researchdesk-web
systemctl start researchdesk-supabase
systemctl restart researchdesk-web
systemctl restart caddy

for i in $(seq 1 60); do
  curl -fsS -o /dev/null "http://127.0.0.1/en" && break
  sleep 5
done
curl -fsS -o /dev/null "http://127.0.0.1/en"
date -u > /opt/researchdesk/READY
echo "ResearchDesk preview ready at ${ORIGIN}"
