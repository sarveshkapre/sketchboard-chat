#!/usr/bin/env bash
set -euo pipefail

required_tools=(
  bash
  git
  node
  npm
  curl
  tar
  unzip
)

echo "Runner OS: $(uname -s)"
echo "Runner ARCH: $(uname -m)"

for tool in "${required_tools[@]}"; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing required tool: $tool" >&2
    exit 1
  fi
done

echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Git version: $(git --version | awk '{print $3}')"
