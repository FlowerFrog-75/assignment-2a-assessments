import path from "node:path";

/** The organisations on the network that the app can act as. */
export type LedgerOrg = "school" | "kanavoogle";

export const LEDGER_ORGS: Record<LedgerOrg, { mspId: string; name: string; role: string; defaultEndpoint: string }> = {
  school: {
    mspId: "SchoolMSP",
    name: "School",
    role: "Issues and revokes skill coins. Runs a peer and its own copy of the chaincode.",
    defaultEndpoint: "localhost:7051",
  },
  kanavoogle: {
    mspId: "KanavoogleMSP",
    name: "Kanavoogle",
    role: "Co-endorses every transaction and verifies credentials. Runs a peer and its own copy of the chaincode.",
    defaultEndpoint: "localhost:9051",
  },
};

export function ledgerChannel(): string {
  return process.env.FABRIC_CHANNEL ?? "skillschannel";
}

export function ledgerChaincode(): string {
  return process.env.FABRIC_CHAINCODE ?? "skillcoin";
}

/**
 * Where to reach an organisation's peer, and the identity to sign with.
 * By default this points at what `pnpm fabric:up` generates. Override
 * the directory with FABRIC_ORGANIZATIONS_DIR and the peer address with
 * FABRIC_SCHOOL_PEER_ENDPOINT / FABRIC_KANAVOOGLE_PEER_ENDPOINT.
 */
export function orgConnectionProfile(org: LedgerOrg) {
  const domain = `${org}.dsw.example`;
  const user = `User1@${domain}`;
  const organizationsDir = process.env.FABRIC_ORGANIZATIONS_DIR ?? "fabric/organizations";
  const base = path.resolve(process.cwd(), organizationsDir, "peerOrganizations", domain);
  return {
    mspId: LEDGER_ORGS[org].mspId,
    peerEndpoint: process.env[`FABRIC_${org.toUpperCase()}_PEER_ENDPOINT`] ?? LEDGER_ORGS[org].defaultEndpoint,
    /** Hostname in the peer's TLS certificate. */
    peerHostAlias: `peer0.${domain}`,
    tlsCertPath: path.join(base, "peers", `peer0.${domain}`, "tls", "ca.crt"),
    certPath: path.join(base, "users", user, "msp", "signcerts", `${user}-cert.pem`),
    keyPath: path.join(base, "users", user, "msp", "keystore", "priv_sk"),
  };
}
