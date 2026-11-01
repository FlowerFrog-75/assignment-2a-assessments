import { createPrivateKey } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as grpc from "@grpc/grpc-js";
import { connect, hash, signers, type Contract, type Gateway, type Network } from "@hyperledger/fabric-gateway";
import { ledgerChaincode, ledgerChannel, orgConnectionProfile, type LedgerOrg } from "./config";

type Connection = { client: grpc.Client; gateway: Gateway };

// One gRPC connection per organisation, kept on globalThis so Next.js hot
// reloads reuse it.
const cache = globalThis as typeof globalThis & { _fabricConnections?: Map<LedgerOrg, Promise<Connection>> };
const connections = (cache._fabricConnections ??= new Map());

async function openConnection(org: LedgerOrg): Promise<Connection> {
  const profile = orgConnectionProfile(org);
  const [tlsRootCert, certificate, privateKeyPem] = await Promise.all([
    readFile(profile.tlsCertPath),
    readFile(profile.certPath),
    readFile(profile.keyPath),
  ]).catch((error: NodeJS.ErrnoException) => {
    throw new Error(
      `Fabric certificates not found (${error.path}). Start the network with \`pnpm fabric:up\` first.`,
    );
  });

  // The app only ever talks to its own organisation's peer. That peer's
  // Fabric Gateway collects the endorsements needed from the other
  // organisation and sends the transaction to the orderer.
  const client = new grpc.Client(profile.peerEndpoint, grpc.credentials.createSsl(tlsRootCert), {
    "grpc.ssl_target_name_override": profile.peerHostAlias,
  });
  const gateway = connect({
    client,
    identity: { mspId: profile.mspId, credentials: certificate },
    signer: signers.newPrivateKeySigner(createPrivateKey(privateKeyPem)),
    hash: hash.sha256,
    evaluateOptions: () => ({ deadline: Date.now() + 5_000 }),
    endorseOptions: () => ({ deadline: Date.now() + 15_000 }),
    submitOptions: () => ({ deadline: Date.now() + 5_000 }),
    commitStatusOptions: () => ({ deadline: Date.now() + 60_000 }),
  });
  return { client, gateway };
}

function getConnection(org: LedgerOrg): Promise<Connection> {
  let connection = connections.get(org);
  if (!connection) {
    connection = openConnection(org);
    connections.set(org, connection);
    connection.catch(() => connections.delete(org)); // retry on the next call
  }
  return connection;
}

export async function getNetwork(org: LedgerOrg = "school"): Promise<Network> {
  return (await getConnection(org)).gateway.getNetwork(ledgerChannel());
}

export async function getSkillcoinContract(org: LedgerOrg = "school"): Promise<Contract> {
  return (await getNetwork(org)).getContract(ledgerChaincode());
}

/** Closes all Fabric connections. Call at the end of scripts. */
export async function closeLedgerConnections(): Promise<void> {
  for (const connection of connections.values()) {
    const { gateway, client } = await connection.catch(() => ({ gateway: null, client: null }));
    gateway?.close();
    client?.close();
  }
  connections.clear();
}

/**
 * Turns a Fabric error into one readable sentence. For a rejected
 * transaction, that is the chaincode's own message (e.g. "Access denied...").
 */
export function describeLedgerError(error: unknown): string {
  const err = error as { code?: number; details?: { message: string }[]; message?: string };
  const messages = [...new Set((err.details ?? []).map((d) => d.message.replace(/^chaincode response \d+, /, "")))];
  if (messages.length > 0) return messages.join("; ");
  if (err.code === grpc.status.UNAVAILABLE || err.code === grpc.status.DEADLINE_EXCEEDED) {
    return "The Fabric network is not reachable. Start it with: pnpm fabric:up";
  }
  return err.message ?? String(error);
}
