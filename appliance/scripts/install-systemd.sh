#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

install -d -o root -g root -m 0755 /etc/haai
install -d -o root -g root -m 0755 /opt/haai

if ! id haai >/dev/null 2>&1; then
  useradd --system --home /var/lib/haai --shell /usr/sbin/nologin haai
fi

install -d -o haai -g haai -m 0750 /var/lib/haai
install -d -o haai -g haai -m 0750 /var/log/haai

if [[ ! -f /etc/haai/haai.env ]]; then
  install -o root -g haai -m 0640 appliance/haai.env.example /etc/haai/haai.env
fi

install -o root -g root -m 0644 appliance/systemd/haai-api.service /etc/systemd/system/haai-api.service
install -o root -g root -m 0644 appliance/systemd/haai-updater.service /etc/systemd/system/haai-updater.service
install -o root -g root -m 0644 appliance/systemd/haai-updater.timer /etc/systemd/system/haai-updater.timer
install -o root -g root -m 0644 appliance/systemd/haai-apply-update.service /etc/systemd/system/haai-apply-update.service
install -o root -g root -m 0755 appliance/scripts/haai-update /opt/haai/appliance/scripts/haai-update
install -o root -g root -m 0755 appliance/scripts/haai-update.mjs /opt/haai/appliance/scripts/haai-update.mjs
install -d -o root -g root -m 0755 /etc/sudoers.d
install -o root -g root -m 0440 appliance/sudoers/haai-updater /etc/sudoers.d/haai-updater

systemctl daemon-reload
systemctl enable haai-api.service
systemctl enable haai-updater.timer
systemctl restart haai-api.service
systemctl start haai-updater.timer
