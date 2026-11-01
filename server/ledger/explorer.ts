import { createHash } from "node:crypto";
import { common, msp, peer } from "@hyperledger/fabric-protos";
import { ledgerChannel, type LedgerOrg } from "./config";
import { getNetwork } from "./gateway";

// Read-only views of the blockchain itself (blocks and their hashes), read
// through the peer's built-in query system chaincode (qscc).

export type ChainInfo = { height: number; currentBlockHash: string; previousBlockHash: string };

export type BlockTransaction = {
  txId: string;
  timestamp: string | null;
  kind: "config" | "transaction" | "other";
  /** MSP ID of the identity that submitted the transaction. */
  creatorMsp: string;
  chaincode?: string;
  functionName?: string;
  /** MSP IDs of the peers whose endorsement (signature) is in the block. */
  endorsers: string[];
  valid: boolean;
};

export type BlockSummary = {
  number: number;
  /** SHA-256 of the block header, which the next block stores as its previousHash. */
  hash: string;
  previousHash: string;
  dataHash: string;
  transactions: BlockTransaction[];
};

const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const utf8 = new TextDecoder();

async function querySystemChaincode(org: LedgerOrg, name: string, ...args: string[]): Promise<Uint8Array> {
  const network = await getNetwork(org);
  return network.getContract("qscc").evaluateTransaction(name, ledgerChannel(), ...args);
}

export async function getChainInfo(org: LedgerOrg = "school"): Promise<ChainInfo> {
  const info = common.BlockchainInfo.deserializeBinary(await querySystemChaincode(org, "GetChainInfo"));
  return {
    height: info.getHeight(),
    currentBlockHash: toHex(info.getCurrentblockhash_asU8()),
    previousBlockHash: toHex(info.getPreviousblockhash_asU8()),
  };
}

export async function getBlock(blockNumber: number, org: LedgerOrg = "school"): Promise<BlockSummary> {
  const block = common.Block.deserializeBinary(
    await querySystemChaincode(org, "GetBlockByNumber", String(blockNumber)),
  );
  const header = block.getHeader();
  if (!header) throw new Error(`Block ${blockNumber} has no header`);
  // One validation code per transaction. 0 means valid.
  const validationCodes =
    block.getMetadata()?.getMetadataList_asU8()[common.BlockMetadataIndex.TRANSACTIONS_FILTER] ?? new Uint8Array();

  return {
    number: header.getNumber(),
    hash: blockHeaderHash(header.getNumber(), header.getPreviousHash_asU8(), header.getDataHash_asU8()),
    previousHash: toHex(header.getPreviousHash_asU8()),
    dataHash: toHex(header.getDataHash_asU8()),
    transactions: (block.getData()?.getDataList_asU8() ?? []).map((envelope, i) =>
      decodeTransaction(envelope, validationCodes[i] ?? 0),
    ),
  };
}

/** The newest `count` blocks, newest first. */
export async function getRecentBlocks(count: number, org: LedgerOrg = "school"): Promise<BlockSummary[]> {
  const { height } = await getChainInfo(org);
  const numbers = Array.from({ length: Math.min(count, height) }, (_, i) => height - 1 - i);
  return Promise.all(numbers.map((n) => getBlock(n, org)));
}

function decodeTransaction(envelopeBytes: Uint8Array, validationCode: number): BlockTransaction {
  const payload = common.Payload.deserializeBinary(common.Envelope.deserializeBinary(envelopeBytes).getPayload_asU8());
  const header = payload.getHeader();
  const channelHeader = common.ChannelHeader.deserializeBinary(header?.getChannelHeader_asU8() ?? new Uint8Array());
  const signatureHeader = common.SignatureHeader.deserializeBinary(header?.getSignatureHeader_asU8() ?? new Uint8Array());
  const type = channelHeader.getType();

  const tx: BlockTransaction = {
    txId: channelHeader.getTxId(),
    timestamp: channelHeader.getTimestamp()?.toDate().toISOString() ?? null,
    kind:
      type === common.HeaderType.CONFIG
        ? "config"
        : type === common.HeaderType.ENDORSER_TRANSACTION
          ? "transaction"
          : "other",
    creatorMsp: msp.SerializedIdentity.deserializeBinary(signatureHeader.getCreator_asU8()).getMspid(),
    endorsers: [],
    valid: validationCode === 0,
  };

  if (type === common.HeaderType.ENDORSER_TRANSACTION) {
    const action = peer.Transaction.deserializeBinary(payload.getData_asU8()).getActionsList()[0];
    if (action) {
      const actionPayload = peer.ChaincodeActionPayload.deserializeBinary(action.getPayload_asU8());
      const proposalPayload = peer.ChaincodeProposalPayload.deserializeBinary(
        actionPayload.getChaincodeProposalPayload_asU8(),
      );
      const spec = peer.ChaincodeInvocationSpec.deserializeBinary(proposalPayload.getInput_asU8()).getChaincodeSpec();
      tx.chaincode = spec?.getChaincodeId()?.getName();
      const [fn] = spec?.getInput()?.getArgsList_asU8() ?? [];
      if (fn) tx.functionName = utf8.decode(fn);
      tx.endorsers = (actionPayload.getAction()?.getEndorsementsList() ?? []).map((endorsement) =>
        msp.SerializedIdentity.deserializeBinary(endorsement.getEndorser_asU8()).getMspid(),
      );
    }
  }
  return tx;
}

// --- Block header hash -------------------------------------------------------
// Fabric hashes the ASN.1 DER encoding of (number, previousHash, dataHash).
// Recomputing it shows that each block really links to the one before it.

function derLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  for (let n = length; n > 0; n >>= 8) bytes.unshift(n & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function derInteger(value: bigint): Buffer {
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  let bytes = Buffer.from(hex, "hex");
  if (bytes[0] & 0x80) bytes = Buffer.concat([Buffer.from([0]), bytes]);
  return Buffer.concat([Buffer.from([0x02]), derLength(bytes.length), bytes]);
}

function derOctetString(bytes: Uint8Array): Buffer {
  return Buffer.concat([Buffer.from([0x04]), derLength(bytes.length), Buffer.from(bytes)]);
}

export function blockHeaderHash(number: number, previousHash: Uint8Array, dataHash: Uint8Array): string {
  const body = Buffer.concat([derInteger(BigInt(number)), derOctetString(previousHash), derOctetString(dataHash)]);
  const der = Buffer.concat([Buffer.from([0x30]), derLength(body.length), body]);
  return createHash("sha256").update(der).digest("hex");
}
