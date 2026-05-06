---
layout: post
title: "KelpDAO Incident Riview"
description: "security incident"
date: 2026-05-02
lang: en
permalink: /en/posts/kelpdao-incident/
category: research
tags: [web3, research]
---

# KelpDAO rsETH × LayerZero Bridge Exploit

**Incident Date:** 2026-04-18 17:35 UTC<br>
**Total Loss:** 116,500 rsETH (~USD 292M)<br>
**Bug Class:** Cross-chain message verification failure via off-chain infrastructure compromise<br>



## TL;DR

An attacker drained 116,500 rsETH (~USD 292M) from KelpDAO's LayerZero bridge by corrupting the RPC infrastructure that a single DVN (validator) depended on. Every smart contract operated according to its specification. Every cryptographic check passed. The system failed because trust was placed in off-chain infrastructure that hadn't earned that level of trust.

This is not a Solidity bug. It is a configuration and infrastructure trust-boundary failure — a bug class that maps cleanly onto traditional pentest methodology

---

## 1. Background concepts

### 1.1 What is rsETH?

rsETH is a Liquid Restaking Token (LRT) issued by KelpDAO. The chain of derivation:

```
ETH → staked on Ethereum → restaked via EigenLayer → rsETH issued as receipt token
```

The receipt token (rsETH) is freely usable as collateral on lending markets (Aave, Spark, Fluid) or tradable on DEXes. The economic value of rsETH is backed by the underlying ETH that's locked in the staking and restaking contracts.

### 1.2 What is LayerZero OFT?

OFT (Omnichain Fungible Token) is LayerZero's standard for tokens that can move across chains. The model:

- One **home chain** (Ethereum for rsETH) holds the canonical token in an escrow contract
- Other chains hold **shadow representations** that are mint/burn pairs against the home escrow
- Moving rsETH from Unichain back to Ethereum means: burn on Unichain → release from escrow on Ethereum
- Moving rsETH from Ethereum to Unichain means: lock in escrow on Ethereum → mint on Unichain

The total supply across all chains must always equal what's locked in escrow. Any break in this invariant produces "unbacked" tokens.

### 1.3 What is a DVN?

A DVN (Decentralized Verifier Network) is an **off-chain service** that watches blockchains and signs attestations about cross-chain events. It is not a smart contract — it's a server process holding a private key.

```
DVN's job:  Watch chain A → see relevant event → sign "I attest this happened" → 
            submit signature to chain B → chain B verifies signature and acts
```

A given OApp (LayerZero application) can require multiple DVNs to sign before a message is accepted. This threshold is called the **quorum**:

- **1-of-1 quorum** — a single DVN's signature is sufficient (single point of failure)
- **2-of-3 quorum** — at least 2 of 3 DVNs must agree (resilient to one compromise)

KelpDAO's rsETH OApp used 1-of-1.

### 1.4 What is RPC?

An RPC (Remote Procedure Call) endpoint is the HTTP API exposed by a blockchain node. It's how off-chain services (wallets, DVNs, indexers) query chain state.

**RPCs are per-chain.** Ethereum has Ethereum RPCs, Unichain has Unichain RPCs. LayerZero has no RPC of its own because LayerZero is not a blockchain — it's smart contracts on multiple chains plus off-chain DVN services.

A DVN serving an Ethereum ↔ Unichain bridge queries both Ethereum RPCs and Unichain RPCs to track events on both sides.

---

## 2. The three-layer architecture

The system involves three distinct layers, each with different trust properties and attack surfaces.

![Three-layer architecture: on-chain contracts trust the DVN, the DVN trusts the RPC layer](/assets/posts/kelpdao-incident/01-three-layer-architecture.svg)

Each layer trusts the layer below it. The on-chain code trusts the DVN's signature. The DVN trusts the RPC's response. The RPC trusts its node binary. **The attack broke the chain at the lowest layer and propagated upward through correctly-functioning systems.**

---

## 3. The attack flow

### 3.1 What the attacker actually did

![Attack sequence: attacker poisons RPC, DVN signs forged attestation, EndpointV2 accepts, OFTAdapter releases 116,500 rsETH](/assets/posts/kelpdao-incident/02-attack-sequence.svg)

**Pre-attack — infrastructure preparation**

1. **Attacker → RPC pool** — Replace op-geth on 2 nodes with poisoned binaries
2. **Attacker → RPC pool** — DDoS the 2 healthy higher-priority nodes
   - *Result: DVN's failover logic now lands on the poisoned nodes*

**Attack execution**

3. **Attacker → EndpointV2** — Submit `lzReceive()` with a forged packet (claims a burn happened on Unichain)
4. **EndpointV2 → DVN** — Request attestation for this packet
5. **DVN → RPC pool** — Query Unichain state ("does this burn exist?")
6. **RPC pool → DVN** — Respond "Yes, burn exists" *(fabricated — the LIE)*
7. **DVN → EndpointV2** — Submit signed attestation (cryptographically valid)
8. **EndpointV2 (self)** — Signature verification passes ✓
9. **EndpointV2 → OFTAdapter** — Deliver the message
10. **OFTAdapter → Attacker** — Release 116,500 rsETH from escrow

**Post-exploit — 46-minute window before detection**

11. **Attacker** — Deposit rsETH as collateral on Aave
12. **Attacker** — Borrow WETH (~$236M potential 2nd-order loss)

### 3.2 Critical correction: what was NOT the attack

A common mischaracterization is "the attacker sent a forged request to the DVN." This is wrong, and the distinction matters for bug classification.

| Misconception | Reality |
|---|---|
| Attacker injected fake messages into DVN | DVN polls RPCs on its own schedule; attacker corrupted the data sources |
| Attacker forged a DVN signature | The DVN's signature was genuine; what was forged was the underlying state it attested to |
| 116,500 rsETH was minted from thin air | rsETH was released from an existing escrow that should have remained locked |
| Smart contract had a vulnerability | All contracts behaved per specification; the bug was in trust assumptions |

### 3.3 The accurate one-paragraph summary

> The attacker tampered with op-geth binaries on Unichain RPC nodes that LayerZero Labs' DVN polled for state, and DDoSed the healthy higher-priority nodes to force the DVN's failover logic onto the poisoned ones. When the DVN queried Unichain looking for burn events, it received fabricated responses indicating that 116,500 rsETH had been burned — events that never actually occurred. The DVN signed an attestation based on this false data, the EndpointV2 contract on Ethereum cryptographically verified the (genuine) signature and accepted the (fabricated) message, and the rsETH OFTAdapter released 116,500 rsETH from its Ethereum escrow to the attacker. No new rsETH was minted; existing tokens backing other-chain shadow representations were released to an attacker who had not earned that release. The result is 116,500 rsETH circulating without underlying ETH collateral.

---

## 4. The OApp configuration that enabled this

```solidity
// KelpDAO rsETH OFT — actual configuration (from public analysis)
requiredDVNs:      [0x282b3386571f7f794450d5789911a9804fa346b4]  // LayerZero Labs DVN
requiredDVNCount:  1
optionalDVNs:      []
optionalDVNCount:  0
threshold:         1-of-1

// Industry-recommended configuration for high-value assets
requiredDVNs:      [DVN_A, DVN_B, DVN_C]  // 3 independent operators
requiredDVNCount:  3
threshold:         2-of-3
```

The 1-of-1 configuration meant the attacker only needed to fool one validator's worldview. With 2-of-3 across independent operators, the attack would have required compromising three separate operational stacks simultaneously.

This configuration risk was publicly raised 15 months before the exploit on the Aave governance forum. It was not changed.

---

## 5. Layer-by-layer responsibility analysis

| Layer | What happened | Worked correctly? | Could have prevented loss? |
|---|---|---|---|
| Smart contracts (`EndpointV2`, `OFTAdapter`) | Verified signatures, delivered messages |  Yes |  No — they had no way to detect the lie |
| DVN service | Polled RPCs, signed based on responses |  Per-spec, but trusted bad data |  With anomaly detection, possibly |
| RPC infrastructure | Two nodes were poisoned, two DDoSed |  No |  Yes — diverse healthy nodes would have prevented it |
| OApp configuration | Used 1-of-1 LayerZero Labs DVN |  Insufficient for asset value |  Yes — 2-of-3 would have made attack much harder |

The exploit succeeded because **all four conditions aligned**. Removing any one of them likely prevents the loss.

---

## 6. Fund flow after the exploit

![Fund flow: stolen rsETH branches to Aave (frozen), Arbitrum freeze (recovered), and THORChain laundering path](/assets/posts/kelpdao-incident/03-fund-flow.svg)

| Destination | Amount | Status |
|---|---|---|
| Aave V3 collateral (rsETH) | 116,500 rsETH | Frozen on Aave; bad debt risk |
| Arbitrum governance freeze | 30,766 ETH (~$71M) | Recovered (pending DAO vote) |
| THORChain ETH→BTC | ~34,500 ETH (~$80M) | Laundered, hard to recover |
| Mixers and CEX | remainder | Tracking ongoing |

**Attribution:** Suspected DPRK-linked Lazarus Group / TraderTraitor based on on-chain forensics by LayerZero, Chainalysis, and others. **Not officially confirmed** by OFAC or law enforcement as of the source bulletin's date.

---

## 7. Bug bounty applicability

This incident establishes a **citable precedent** for an entire class of findings that previously had to be argued from first principles. The methodology that follows is directly transferable to other cross-chain protocols.

### 7.1 What to hunt for

![Hunting workflow: decision tree for evaluating OApp DVN configurations as bug bounty findings](/assets/posts/kelpdao-incident/04-hunting-workflow.svg)

### 7.2 Inspection workflow with `cast`

```bash
# 1. Find the OApp's send/receive libraries
cast call $ENDPOINT_V2 \
  "getSendLibrary(address,uint32)(address)" \
  $OAPP_ADDRESS \
  $REMOTE_EID \
  --rpc-url $ETH_RPC

# 2. Pull the ULN config (CONFIG_TYPE_ULN = 2)
cast call $ENDPOINT_V2 \
  "getConfig(address,address,uint32,uint32)(bytes)" \
  $OAPP_ADDRESS \
  $SEND_LIB \
  $REMOTE_EID \
  2 \
  --rpc-url $ETH_RPC

# 3. Decode the returned UlnConfig struct
# struct UlnConfig {
#     uint64 confirmations;
#     uint8 requiredDVNCount;
#     uint8 optionalDVNCount;
#     uint8 optionalDVNThreshold;
#     address[] requiredDVNs;
#     address[] optionalDVNs;
# }
```

If `requiredDVNCount + optionalDVNThreshold` is small relative to the OApp's TVL — and especially if the DVN addresses resolve to a single operator — you have a credible finding.

### 7.3 Foundry PoC structure

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

contract OAppConfigAudit is Test {
    address constant ENDPOINT_V2 = 0x1a44076050125825900e736c501f859c50fE728c;
    address constant TARGET_OAPP = 0x...;  // your audit target
    uint32  constant REMOTE_EID  = 30320;  // Unichain in this case

    function test_singleDVN_isSinglePointOfFailure() public {
        vm.createSelectFork("mainnet");

        bytes memory configBytes = IEndpointV2(ENDPOINT_V2).getConfig(
            TARGET_OAPP,
            getSendLib(),
            REMOTE_EID,
            2  // CONFIG_TYPE_ULN
        );

        UlnConfig memory uln = abi.decode(configBytes, (UlnConfig));

        // Document the finding
        emit log_named_uint("requiredDVNCount", uln.requiredDVNCount);
        emit log_named_uint("optionalDVNThreshold", uln.optionalDVNThreshold);

        // Flag if quorum is dangerously low
        uint256 effectiveThreshold = uln.requiredDVNCount + uln.optionalDVNThreshold;
        assertGt(effectiveThreshold, 1, "Single point of failure detected");
    }
}
```

A test like this — combined with TVL data and the KelpDAO precedent — is enough for a credible "Critical configuration risk" submission to most bridge bug bounty programs.

### 7.4 Generalization beyond LayerZero

The same methodology applies to other cross-chain systems with adapted vocabulary:

| Protocol | Equivalent of "quorum" | What to look for |
|---|---|---|
| Wormhole | Guardian set signature threshold | Currently 13-of-19; check forks |
| Axelar | Validator stake-weighted threshold | Stake concentration, validator overlap |
| Hyperlane | ISM (Interchain Security Module) config | Custom ISMs that downgrade security |
| Chainlink CCIP | RMN (Risk Management Network) config | RMN node count and operator diversity |
| Across | Relayer/optimistic oracle config | Challenge windows, bonding amounts |

---

## 8. Defensive recommendations

For protocol teams, these are the changes that would have prevented the loss:

1. **Multi-DVN quorum** — Minimum 2-of-3 with independent operators for any asset above ~$10M TVL. The economic cost of running additional DVNs is trivial relative to the loss prevented.

2. **DVN operator diversity** — DVNs should run on independent infrastructure: different cloud providers, different geographies, different RPC providers. Same-operator DVN sets provide nominal but not real diversity.

3. **RPC pool diversity for DVNs** — Each DVN should query at least 3 independent RPC providers and apply consensus logic before treating a query result as authoritative. Cross-checking responses would have detected the KelpDAO poisoning.

4. **Anomaly detection on DVN attestations** — If a DVN is about to attest to a release of more than X% of escrow value within Y minutes, require human approval or apply rate limits.

5. **Configuration audits as a separate review category** — Smart contract audits don't review post-deployment configuration. Make this a distinct deliverable.

6. **Bridge-layer rate limiting** — On the OFTAdapter itself, cap the maximum value released per block or per epoch. This wouldn't prevent the attack but would dramatically reduce the loss.

---

## 9. Key on-chain identifiers

| Item | Address / hash |
|---|---|
| Exploit transaction | `0x1ae232da212c45f35c1525f851e4c41d529bf18af862d9ce9fd40bf709db4222` |
| LayerZero EndpointV2 (Ethereum) | `0x1a44076050125825900e736c501f859c50fE728c` |
| Kelp rsETH OFTAdapter | `0x85d456B2DfF1fd8245387C0BfB64Dfb700e98Ef3` |
| Compromised DVN | `0x282b3386571f7f794450d5789911a9804fa346b4` (LayerZero Labs) |
| Attacker wallet | `0x8B1b6c9A6DB1304000412dd21Ae6A70a82d60D3b` |
| Arbitrum governance freeze address | `0x000000000000000000000000000000000000dA0` |
| Unichain Endpoint ID (forged srcEid) | `30320` |
| Forged packet nonce | `308` |

---

## 10. Implications for Web3 Bug Bounty

For a security researcher moving into Web3 bug bounty work, this incident is a near-perfect case study because:

- **It demonstrates a bug class that doesn't require deep Solidity expertise to find.** The bug lives in configuration data and infrastructure trust assumptions — territory that maps onto traditional pentest thinking.
- **It establishes citable precedent.** A finding submitted as "OApp X reproduces the conditions of the April 2026 KelpDAO incident" carries significant weight.
- **The hunting workflow is scriptable.** Pulling DVN configurations across hundreds of OApps is a single afternoon's work with `cast`.
- **The attack surface generalizes.** Same methodology applied to Wormhole, Axelar, Hyperlane, CCIP, etc. yields parallel findings.

The most important conceptual shift: in Web3, **the audited code is only one piece of the trusted computing base**. Configuration, off-chain validators, RPC dependencies, oracle providers, governance multisigs — all of these are part of the trust boundary, and all of them are valid bug bounty territory. KelpDAO is the case that makes this concrete.

---

## Reference

- **KelpDAO rsETH / LayerZero Bridge Security Incident Report**: [KelpDAO rsETH / LayerZero Bridge Security Incident Report](https://www.sooho.io/articles/kelpdao-rseth-layerzero-%EB%B8%8C%EB%A6%BF%EC%A7%80-%EB%B3%B4%EC%95%88-%EC%82%AC%EA%B3%A0-%EB%A6%AC%ED%8F%AC%ED%8A%B8)