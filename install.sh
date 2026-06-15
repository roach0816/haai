#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${HAAI_APP_DIR:-/opt/haai}"
DATA_DIR="${HAAI_DATA_DIR:-/var/lib/haai}"
LOG_DIR="${HAAI_LOG_DIR:-/var/log/haai}"
SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
INSTALL_OS_DEPS="${HAAI_INSTALL_OS_DEPS:-1}"
INSTALL_NODE_DEPS="${HAAI_INSTALL_NODE_DEPS:-1}"
SKIP_BUILD="${HAAI_INSTALL_SKIP_BUILD:-0}"
INSTALL_CLOUDFLARED="${HAAI_INSTALL_CLOUDFLARED:-0}"
CLOUDFLARED_TOKEN="${HAAI_CLOUDFLARED_TOKEN:-}"
CLOUDFLARED_TOKEN_FILE="${HAAI_CLOUDFLARED_TOKEN_FILE:-}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo ./install.sh" >&2
  exit 1
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

install_os_dependencies() {
  if [[ "${INSTALL_OS_DEPS}" != "1" ]]; then
    return
  fi
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "Automatic OS dependency install currently supports Debian, Ubuntu, and Raspberry Pi OS." >&2
    echo "Install git, curl, sudo, nodejs, npm, build-essential, python3, make, and g++ manually, then rerun with HAAI_INSTALL_OS_DEPS=0." >&2
    exit 1
  fi

  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl git sudo build-essential python3 make g++ rsync
  if ! node_major_version_at_least 20; then
    echo "Installing Node.js 22 because Home Assistant AI requires Node.js 20 or newer."
    curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/haai-nodesource-setup.sh
    bash /tmp/haai-nodesource-setup.sh
    apt-get install -y nodejs
  elif ! command -v npm >/dev/null 2>&1; then
    apt-get install -y npm
  fi
}

node_major_version_at_least() {
  local minimum="$1"
  if ! command -v node >/dev/null 2>&1; then
    return 1
  fi
  local major
  major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
  [[ "${major}" =~ ^[0-9]+$ ]] && [[ "${major}" -ge "${minimum}" ]]
}

assert_app_source() {
  for file in package.json package-lock.json appliance/scripts/install-systemd.sh src/server/index.ts; do
    if [[ ! -f "${SOURCE_DIR}/${file}" ]]; then
      echo "This installer must be run from the Home Assistant AI source directory." >&2
      echo "Missing ${file}" >&2
      exit 1
    fi
  done
}

prepare_app_dir() {
  install -d -o root -g root -m 0755 "${APP_DIR}"
  local source_real app_real
  source_real="$(cd "${SOURCE_DIR}" && pwd -P)"
  app_real="$(cd "${APP_DIR}" && pwd -P)"
  if [[ "${source_real}" == "${app_real}" ]]; then
    return
  fi

  if [[ -f "${APP_DIR}/package.json" ]] && ! grep -q '"name": "haai"' "${APP_DIR}/package.json"; then
    echo "${APP_DIR} already contains a different application. Set HAAI_APP_DIR or clear the directory first." >&2
    exit 1
  fi

  rsync -a --delete \
    --exclude ".git" \
    --exclude ".data" \
    --exclude "dist" \
    --exclude "node_modules" \
    --exclude "release" \
    "${SOURCE_DIR}/" "${APP_DIR}/"
}

install_node_dependencies() {
  if [[ "${INSTALL_NODE_DEPS}" != "1" ]]; then
    return
  fi
  require_command npm
  cd "${APP_DIR}"
  npm ci
  if [[ "${SKIP_BUILD}" != "1" ]]; then
    npm run build
  fi
  npm prune --omit=dev
}

install_services() {
  cd "${APP_DIR}"
  HAAI_APP_DIR="${APP_DIR}" \
    HAAI_DATA_DIR="${DATA_DIR}" \
    HAAI_LOG_DIR="${LOG_DIR}" \
    bash appliance/scripts/install-systemd.sh
}

read_cloudflared_token() {
  if [[ -n "${CLOUDFLARED_TOKEN}" ]]; then
    printf '%s' "${CLOUDFLARED_TOKEN}"
    return
  fi
  if [[ -n "${CLOUDFLARED_TOKEN_FILE}" ]]; then
    if [[ ! -f "${CLOUDFLARED_TOKEN_FILE}" ]]; then
      echo "Cloudflare Tunnel token file not found: ${CLOUDFLARED_TOKEN_FILE}" >&2
      exit 1
    fi
    tr -d '\r\n' <"${CLOUDFLARED_TOKEN_FILE}"
  fi
}

cloudflared_deb_asset() {
  local arch
  arch="$(dpkg --print-architecture 2>/dev/null || uname -m)"
  case "${arch}" in
    amd64 | x86_64)
      echo "cloudflared-linux-amd64.deb"
      ;;
    arm64 | aarch64)
      echo "cloudflared-linux-arm64.deb"
      ;;
    armhf | armv7l | armv6l)
      echo "cloudflared-linux-arm.deb"
      ;;
    *)
      echo "Unsupported architecture for automatic cloudflared install: ${arch}" >&2
      exit 1
      ;;
  esac
}

install_cloudflared() {
  local token
  token="$(read_cloudflared_token)"
  if [[ "${INSTALL_CLOUDFLARED}" != "1" && -z "${token}" ]]; then
    return
  fi

  if ! command -v apt-get >/dev/null 2>&1; then
    echo "Automatic cloudflared install currently supports Debian, Ubuntu, and Raspberry Pi OS." >&2
    echo "Install cloudflared manually, then run the Cloudflare Tunnel service install command from your Cloudflare dashboard." >&2
    exit 1
  fi

  if ! command -v cloudflared >/dev/null 2>&1; then
    local asset package_path
    asset="$(cloudflared_deb_asset)"
    package_path="/tmp/${asset}"
    echo "Installing cloudflared from Cloudflare's latest GitHub release (${asset})."
    apt-get install -y ca-certificates curl
    curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}" -o "${package_path}"
    apt-get install -y "${package_path}"
  fi

  if [[ -z "${token}" ]]; then
    echo "cloudflared is installed. Create a Cloudflare Tunnel in the Zero Trust dashboard, then rerun with HAAI_CLOUDFLARED_TOKEN or HAAI_CLOUDFLARED_TOKEN_FILE to register it as a service."
    return
  fi

  if systemctl list-unit-files cloudflared.service --no-legend 2>/dev/null | grep -q '^cloudflared.service'; then
    echo "cloudflared.service already exists; leaving the existing tunnel registration in place."
    systemctl enable --now cloudflared.service
    return
  fi

  echo "Registering Cloudflare Tunnel as cloudflared.service."
  cloudflared service install "${token}"
  systemctl enable --now cloudflared.service
}

print_summary() {
  local ip_address port
  ip_address="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  port="8787"
  if [[ -f "${DATA_DIR}/runtime-config.json" ]]; then
    port="$(node -e "const fs=require('fs'); const p='${DATA_DIR}/runtime-config.json'; try { console.log(JSON.parse(fs.readFileSync(p, 'utf8')).httpPort || 8787); } catch { console.log(8787); }")"
  fi
  echo
  echo "Home Assistant AI is installed."
  echo "Service: $(systemctl is-active haai-api.service || true)"
  echo "Updater timer: $(systemctl is-active haai-updater.timer || true)"
  if command -v cloudflared >/dev/null 2>&1; then
    echo "Cloudflare Tunnel: $(systemctl is-active cloudflared.service 2>/dev/null || echo installed)"
  fi
  echo
  echo "Open the web UI:"
  if [[ -n "${ip_address}" ]]; then
    echo "  http://${ip_address}:${port}"
  fi
  echo "  http://<this-host>:${port}"
  echo
  echo "Next steps:"
  echo "  1. Create the local admin account."
  echo "  2. Configure Home Assistant, AI provider, Network & TLS, and Updates in Settings."
}

assert_app_source
install_os_dependencies
if ! node_major_version_at_least 20; then
  echo "Node.js 20 or newer is required. Current version: $(node --version 2>/dev/null || echo missing)" >&2
  exit 1
fi
prepare_app_dir
install_node_dependencies
install_services
install_cloudflared
print_summary
