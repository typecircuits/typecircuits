#!/bin/bash -e

if ! [[ -z "$CI" ]]; then
    rustup default stable
    rustup target add wasm32-unknown-unknown
    brew install binaryen
    curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash && cargo binstall wasm-bindgen-cli
fi

mkdir -p vendor
curl -fsSL https://www.wipple.org/playground/assets/foundation.bin > vendor/wipple-foundation.bin
(cd vendor/wipple/compiler/api && npm run build)
(cd core && npm run build)
