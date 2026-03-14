#!/bin/bash
set -eo pipefail

echo "================================================================"
echo "Initializing Linux Agent Environment for Second Edition Spellbook"
echo "================================================================"

# Ensure we are running from the repository root
if [ ! -f "apps/desktop/package.json" ]; then
    echo "Error: Please run this script from the root of the repository."
    exit 1
fi

echo "--> Updating package lists..."
sudo apt-get update

echo "--> Installing core system dependencies and Tauri prerequisites..."
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    pkg-config \
    libssl-dev \
    libglib2.0-dev \
    libgtk-3-dev \
    libsoup-3.0-dev \
    libwebkit2gtk-4.1-dev \
    software-properties-common \
    gh

echo "--> Setting up Python 3.14..."
# Add deadsnakes PPA for newer Python versions (Ubuntu)
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y python3.14 python3.14-venv python3.14-dev

echo "--> Setting up Node.js 24 and pnpm 10..."
# Install nvm
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# Load nvm for the current session
export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
# Install and use Node.js 24
nvm install 24
nvm use 24
nvm alias default 24

# Install pnpm 10
sudo npm install -g pnpm@10

echo "--> Setting up Rust toolchain (stable)..."
if ! command -v cargo &> /dev/null; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    # Sourcecargo env for the current session
    export PATH="$HOME/.cargo/bin:$PATH"
else
    rustup update stable
fi

# Add required Rust components
rustup component add rustfmt clippy

echo "--> Initializing Python environment (services/ml)..."
cd services/ml
python3.14 -m venv .venv
# Upgrade pip in the virtualenv
.venv/bin/python -m pip install --upgrade pip
# Install dependencies
.venv/bin/python -m pip install -r requirements.txt -r requirements-dev.txt
cd ../..

echo "--> Initializing JS environment (apps/desktop)..."
cd apps/desktop
pnpm install --frozen-lockfile
cd ../..

echo "--> Installing openSpec CLI globally..."
npm install -g @fission-ai/openspec@latest

echo "================================================================"
echo "Environment initialization complete!"
echo "If rust was just installed, you may need to run:"
echo "source \$HOME/.cargo/env"
echo "================================================================"
