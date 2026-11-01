import { SkillCoinContract } from "./skillcoin-contract";

export { SkillCoinContract } from "./skillcoin-contract";

// The first contract is the default, so clients call "IssueCoins" rather than
// "SkillCoinContract:IssueCoins".
export const contracts = [SkillCoinContract];
