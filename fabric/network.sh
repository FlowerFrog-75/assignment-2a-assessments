#!/usr/bin/env bash
# Hyperledger Fabric network for the Digital Skills Wallet.
#
#   ./fabric/network.sh up       # first run: build everything. Later runs: start it again
#   ./fabric/network.sh down     # stop the network (ledger data is kept)
#   ./fabric/network.sh status   # containers, block height, deployed chaincode
#   ./fabric/network.sh clean    # DELETE the network, ledger and certificates
#
# Only Docker is needed. The Fabric tools (cryptogen, configtxgen, osnadmin,
# peer) run inside the hyperledger/fabric-tools image.
set -euo pipefail

cd "$(dirname "$0")"
export FABRIC_VERSION="${FABRIC_VERSION:-2.5.16}"

CHANNEL=skillschannel
CC_NAME=skillcoin
CC_VERSION=1.0
CC_SEQUENCE=1
# Every transaction must be endorsed by BOTH organisations' peers, so neither
# the school nor Kanavoogle can write to the ledger on its own.
CC_POLICY="AND('SchoolMSP.peer','KanavoogleMSP.peer')"
ORGS=(school kanavoogle)
ORDERER=orderer.dsw.example:7050
ORDERER_TLS=/work/organizations/ordererOrganizations/dsw.example/orderers/orderer.dsw.example/tls
COMPOSE=(docker compose -f docker-compose.yaml)

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }

# Runs a Fabric CLI tool in the tools image. TOOLS_NET=none for steps that run
# before the network exists.
tools() {
  docker run --rm --network "${TOOLS_NET:-dsw-fabric}" --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$PWD:/work" -w /work "hyperledger/fabric-tools:$FABRIC_VERSION" "$@"
}

msp_id() { case "$1" in school) echo SchoolMSP ;; kanavoogle) echo KanavoogleMSP ;; esac; }
peer_tls_ca() { echo "/work/organizations/peerOrganizations/$1.dsw.example/peers/peer0.$1.dsw.example/tls/ca.crt"; }

# Runs the `peer` CLI as an organisation's admin, against that org's peer.
peer_as() {
  local org=$1; shift
  local domain="$org.dsw.example"
  tools env \
    CORE_PEER_TLS_ENABLED=true \
    CORE_PEER_LOCALMSPID="$(msp_id "$org")" \
    CORE_PEER_TLS_ROOTCERT_FILE="$(peer_tls_ca "$org")" \
    CORE_PEER_MSPCONFIGPATH="/work/organizations/peerOrganizations/$domain/users/Admin@$domain/msp" \
    CORE_PEER_ADDRESS="peer0.$domain:7051" \
    peer "$@"
}

# Retries a command while nodes start up. Output is printed only on the
# final success or failure.
retry() {
  local attempt output=""
  for attempt in $(seq 1 15); do
    if output=$("$@" 2>&1); then
      [ -n "$output" ] && echo "$output"
      return 0
    fi
    sleep 2
  done
  echo "$output" >&2
  return 1
}

generate_crypto() {
  log "Generating certificates and keys for all organisations (cryptogen)"
  TOOLS_NET=none tools cryptogen generate --config=config/crypto-config.yaml --output=organizations
}

create_genesis_block() {
  log "Creating the genesis block for channel '$CHANNEL' (configtxgen)"
  mkdir -p channel-artifacts
  TOOLS_NET=none tools configtxgen -configPath config -profile SkillsChannel \
    -channelID "$CHANNEL" -outputBlock "channel-artifacts/$CHANNEL.block"
}

start_nodes() {
  log "Starting the orderer and both peers"
  "${COMPOSE[@]}" up -d orderer.dsw.example peer0.school.dsw.example peer0.kanavoogle.dsw.example
}

join_channel() {
  log "Joining the orderer to '$CHANNEL' (osnadmin)"
  retry tools osnadmin channel join --channelID "$CHANNEL" --config-block "channel-artifacts/$CHANNEL.block" \
    -o orderer.dsw.example:7053 --ca-file "$ORDERER_TLS/ca.crt" \
    --client-cert "$ORDERER_TLS/server.crt" --client-key "$ORDERER_TLS/server.key"

  for org in "${ORGS[@]}"; do
    log "Joining peer0.$org to '$CHANNEL'"
    retry peer_as "$org" channel join -b "channel-artifacts/$CHANNEL.block"
  done
}

# A chaincode-as-a-service package holds only the address of the running
# chaincode. The code itself runs in that org's skillcoin-<org> container.
package_chaincode() {
  local org=$1 dir="packages/$1"
  rm -rf "$dir" && mkdir -p "$dir"
  printf '{"address":"skillcoin.%s.dsw.example:9999","dial_timeout":"10s","tls_required":false}\n' "$org" > "$dir/connection.json"
  printf '{"type":"ccaas","label":"%s_%s"}\n' "$CC_NAME" "$CC_VERSION" > "$dir/metadata.json"
  tar -C "$dir" -czf "$dir/code.tar.gz" connection.json
  tar -C "$dir" -czf "packages/$CC_NAME-$org.tar.gz" metadata.json code.tar.gz
}

package_id() {
  local var
  var="SKILLCOIN_$(echo "$1" | tr '[:lower:]' '[:upper:]')_PACKAGE_ID"
  grep "^$var=" .env | cut -d= -f2-
}

deploy_chaincode() {
  # SKIP_CHAINCODE_BUILD=1 uses an existing dsw/skillcoin-chaincode:1.0 image
  # (e.g. one pulled from your registry) instead of building it here.
  if [ "${SKIP_CHAINCODE_BUILD:-}" = 1 ]; then
    log "Using the existing skillcoin chaincode image"
  else
    log "Building the skillcoin chaincode image"
    "${COMPOSE[@]}" build skillcoin-school
  fi

  : > .env
  for org in "${ORGS[@]}"; do
    log "Packaging and installing skillcoin on peer0.$org"
    package_chaincode "$org"
    retry peer_as "$org" lifecycle chaincode install "packages/$CC_NAME-$org.tar.gz"
    local id
    id=$(TOOLS_NET=none tools peer lifecycle chaincode calculatepackageid "packages/$CC_NAME-$org.tar.gz")
    echo "SKILLCOIN_$(echo "$org" | tr '[:lower:]' '[:upper:]')_PACKAGE_ID=$id" >> .env
  done

  log "Starting each organisation's chaincode service"
  "${COMPOSE[@]}" up -d skillcoin-school skillcoin-kanavoogle

  for org in "${ORGS[@]}"; do
    log "Approving the chaincode definition as $(msp_id "$org")"
    retry peer_as "$org" lifecycle chaincode approveformyorg -o "$ORDERER" --tls --cafile "$ORDERER_TLS/ca.crt" \
      --channelID "$CHANNEL" --name "$CC_NAME" --version "$CC_VERSION" --sequence "$CC_SEQUENCE" \
      --package-id "$(package_id "$org")" --signature-policy "$CC_POLICY"
  done

  log "Committing the chaincode definition to '$CHANNEL'"
  retry peer_as school lifecycle chaincode commit -o "$ORDERER" --tls --cafile "$ORDERER_TLS/ca.crt" \
    --channelID "$CHANNEL" --name "$CC_NAME" --version "$CC_VERSION" --sequence "$CC_SEQUENCE" \
    --signature-policy "$CC_POLICY" \
    --peerAddresses peer0.school.dsw.example:7051 --tlsRootCertFiles "$(peer_tls_ca school)" \
    --peerAddresses peer0.kanavoogle.dsw.example:7051 --tlsRootCertFiles "$(peer_tls_ca kanavoogle)"
}

wait_for_chaincode() {
  log "Checking the chaincode answers on both peers"
  for org in "${ORGS[@]}"; do
    retry peer_as "$org" chaincode query -C "$CHANNEL" -n "$CC_NAME" -c '{"Args":["GetWallet","DSW-SMOKE-TEST"]}' > /dev/null \
      || fail "skillcoin is not answering on peer0.$org. Check: docker compose -f fabric/docker-compose.yaml logs"
    echo "peer0.$org: OK"
  done
}

up() {
  if [ -f .env ] && [ -d organizations ]; then
    log "Starting the existing network"
    "${COMPOSE[@]}" up -d
  elif [ -d organizations ] || [ -n "$(docker volume ls -q --filter name=dsw-fabric_)" ]; then
    fail "Found a partly created network. Run './fabric/network.sh clean', then 'up' again."
  else
    generate_crypto
    create_genesis_block
    start_nodes
    join_channel
    deploy_chaincode
  fi
  wait_for_chaincode
  log "Fabric network is running: channel '$CHANNEL', chaincode '$CC_NAME' (endorsement: $CC_POLICY)"
  echo "Next: npm run ledger:sync   # write the skill coins from MongoDB to the ledger"
}

down() {
  log "Stopping the network (ledger data is kept)"
  "${COMPOSE[@]}" down
}

status() {
  "${COMPOSE[@]}" ps
  log "Channel '$CHANNEL'"
  peer_as school channel getinfo -c "$CHANNEL"
  log "Chaincode"
  peer_as school lifecycle chaincode querycommitted -C "$CHANNEL" -n "$CC_NAME"
}

clean() {
  log "Deleting the network, its ledger data and certificates"
  "${COMPOSE[@]}" down --volumes --remove-orphans
  rm -rf organizations channel-artifacts packages .env
  echo "Done. MongoDB still marks previously synced coins as committed."
  echo "After the next 'up', run: npm run ledger:sync -- --resync"
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  status) status ;;
  clean) clean ;;
  *) echo "Usage: $0 up|down|status|clean" >&2; exit 1 ;;
esac
