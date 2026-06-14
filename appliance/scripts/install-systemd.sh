#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${HAAI_APP_DIR:-/opt/haai}"
DATA_DIR="${HAAI_DATA_DIR:-/var/lib/haai}"
LOG_DIR="${HAAI_LOG_DIR:-/var/log/haai}"
SYSTEMCTL="$(command -v systemctl)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

for command in install useradd id sudo visudo node npm; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Missing required command: ${command}" >&2
    exit 1
  fi
done

for file in \
  appliance/haai.env.example \
  appliance/systemd/haai-api.service \
  appliance/systemd/haai-updater.service \
  appliance/systemd/haai-updater.timer \
  appliance/systemd/haai-apply-update.service \
  appliance/scripts/haai-update \
  appliance/scripts/haai-update.mjs \
  appliance/sudoers/haai-updater
do
  if [[ ! -f "${file}" ]]; then
    echo "Missing required installer file: ${file}" >&2
    exit 1
  fi
done

install -d -o root -g root -m 0755 /etc/haai
install -d -o root -g root -m 0755 "${APP_DIR}"

if ! id haai >/dev/null 2>&1; then
  useradd --system --home "${DATA_DIR}" --shell /usr/sbin/nologin haai
fi

install -d -o haai -g haai -m 0750 "${DATA_DIR}"
install -d -o haai -g haai -m 0750 "${LOG_DIR}"
install -d -o root -g root -m 0755 "${APP_DIR}/appliance/scripts"

if [[ ! -f /etc/haai/haai.env ]]; then
  install -o root -g haai -m 0640 appliance/haai.env.example /etc/haai/haai.env
elif grep -qx "HAAI_PORT=8787" /etc/haai/haai.env; then
  sed -i "s/^HAAI_PORT=8787/# HAAI_PORT=8787/" /etc/haai/haai.env
fi

install -o root -g root -m 0644 appliance/systemd/haai-api.service /etc/systemd/system/haai-api.service
install -o root -g root -m 0644 appliance/systemd/haai-updater.service /etc/systemd/system/haai-updater.service
install -o root -g root -m 0644 appliance/systemd/haai-updater.timer /etc/systemd/system/haai-updater.timer
install -o root -g root -m 0644 appliance/systemd/haai-apply-update.service /etc/systemd/system/haai-apply-update.service
install -o root -g root -m 0755 appliance/scripts/haai-update "${APP_DIR}/appliance/scripts/haai-update"
install -o root -g root -m 0755 appliance/scripts/haai-update.mjs "${APP_DIR}/appliance/scripts/haai-update.mjs"
install -d -o root -g root -m 0755 /etc/sudoers.d
install -o root -g root -m 0440 appliance/sudoers/haai-updater /etc/sudoers.d/haai-updater
visudo -cf /etc/sudoers.d/haai-updater

"${SYSTEMCTL}" daemon-reload
"${SYSTEMCTL}" enable haai-api.service
"${SYSTEMCTL}" enable haai-updater.timer
"${SYSTEMCTL}" restart haai-api.service
"${SYSTEMCTL}" start haai-updater.timer

"${SYSTEMCTL}" cat haai-api.service >/dev/null
"${SYSTEMCTL}" cat haai-updater.service >/dev/null
"${SYSTEMCTL}" cat haai-updater.timer >/dev/null
"${SYSTEMCTL}" cat haai-apply-update.service >/dev/null

sudo -u haai sudo -n -l "${SYSTEMCTL}" start haai-apply-update.service >/dev/null
sudo -u haai sudo -n -l "${SYSTEMCTL}" restart --no-block haai-api.service >/dev/null

echo "Home Assistant AI systemd services installed."
echo "API service: $("${SYSTEMCTL}" is-active haai-api.service)"
echo "Updater timer: $("${SYSTEMCTL}" is-active haai-updater.timer)"
echo "Apply-update and API restart permissions are installed through sudoers."
