---
layout: post
title: "KelpDAO 事件复盘"
description: "安全事件分析"
date: 2026-05-02
lang: zh
permalink: /zh/posts/kelpdao-incident/
category: web3
tags: [web3, research]
---

# KelpDAO rsETH × LayerZero 跨链桥漏洞利用

**事件发生时间:** 2026-04-18 17:35 UTC<br>
**总损失:** 116,500 rsETH (~USD 292M)<br>
**漏洞类别:** 通过链下基础设施入侵导致的跨链消息验证失败<br>



## TL;DR

攻击者通过破坏单一 DVN(验证者)所依赖的 RPC 基础设施,从 KelpDAO 的 LayerZero 跨链桥中窃取了 116,500 rsETH(~USD 292M)。所有智能合约都按规范运作,所有密码学验证也都通过了。系统失败的原因在于:信任被授予了不配享有该层级信任的链下基础设施。

这并不是一个 Solidity 漏洞,而是配置和基础设施信任边界(trust-boundary)上的失败 — 一类可以清晰映射到传统渗透测试方法论上的漏洞类别。

---

## 1. 背景概念

### 1.1 什么是 rsETH?

rsETH 是 KelpDAO 发行的 LRT(Liquid Restaking Token,流动性再质押代币)。其推导链路如下:

```
ETH → 在以太坊上质押 → 通过 EigenLayer 再质押 → 作为凭证代币发行 rsETH
```

凭证代币 rsETH 可在借贷市场(Aave、Spark、Fluid)上自由用作抵押品,或在 DEX 上交易。rsETH 的经济价值由锁定在质押和再质押合约中的底层 ETH 支撑。

### 1.2 什么是 LayerZero OFT?

OFT(Omnichain Fungible Token)是 LayerZero 用于跨链可移动代币的标准。模型如下:

- 一条**主链**(rsETH 的主链是 Ethereum)在托管合约中持有规范代币
- 其他链持有与主链托管形成 mint/burn 配对的**影子表示(shadow representation)**
- 将 rsETH 从 Unichain 移回 Ethereum:在 Unichain 上 burn → 从 Ethereum 托管中 release
- 将 rsETH 从 Ethereum 移到 Unichain:锁定到 Ethereum 托管 → 在 Unichain 上 mint

所有链上的总供应量必须始终等于托管中锁定的数量。这一不变量被打破就会产生"无支撑(unbacked)"代币。

### 1.3 什么是 DVN?

DVN(Decentralized Verifier Network)是一种**链下服务**,它监视区块链并对跨链事件签名出具证明。它不是智能合约 — 而是持有私钥的服务器进程。

```
DVN 的工作:  监视链 A → 看到相关事件 → 签名"我证明此事发生" →
             将签名提交到链 B → 链 B 验证签名后执行操作
```

一个 OApp(LayerZero 应用)在接受消息前可以要求多个 DVN 签名。这一阈值称为**法定数量(quorum)**:

- **1-of-1 法定数量** — 单一 DVN 的签名即可(单点故障)
- **2-of-3 法定数量** — 3 个 DVN 中至少 2 个必须达成一致(对单点入侵具有韧性)

KelpDAO 的 rsETH OApp 使用的是 1-of-1。

### 1.4 什么是 RPC?

RPC(Remote Procedure Call)端点是区块链节点对外暴露的 HTTP API。它是链下服务(钱包、DVN、索引器)查询链上状态的方式。

**RPC 是按链划分的。** Ethereum 有 Ethereum 的 RPC,Unichain 有 Unichain 的 RPC。LayerZero 自身没有 RPC,因为 LayerZero 不是区块链 — 它是多条链上的智能合约加上链下 DVN 服务的组合。

服务于 Ethereum ↔ Unichain 跨链桥的 DVN 同时查询 Ethereum RPC 和 Unichain RPC,以追踪两侧的事件。

---

## 2. 三层架构

该系统由三个具有不同信任属性和攻击面的层次构成。

![三层架构:链上合约信任 DVN,DVN 信任 RPC 层](/assets/posts/kelpdao-incident/01-three-layer-architecture.svg)

每一层都信任其下层。链上代码信任 DVN 的签名。DVN 信任 RPC 的响应。RPC 信任自己的节点二进制文件。**攻击在最底层切断了信任链,然后通过正常运作的系统向上传播。**

---

## 3. 攻击流程

### 3.1 攻击者实际做了什么

![攻击序列:攻击者篡改 RPC,DVN 对伪造证明签名,EndpointV2 接受,OFTAdapter release 出 116,500 rsETH](/assets/posts/kelpdao-incident/02-attack-sequence.svg)

**攻击前期 — 基础设施准备**

1. **攻击者 → RPC 池** — 将 2 个节点的 op-geth 替换为篡改过的二进制文件
2. **攻击者 → RPC 池** — 对更高优先级的 2 个健康节点发起 DDoS
   - *结果:DVN 的故障转移逻辑落到被篡改的节点上*

**攻击执行**

3. **攻击者 → EndpointV2** — 使用伪造数据包调用 `lzReceive()`(声称 Unichain 上发生了 burn)
4. **EndpointV2 → DVN** — 请求对此数据包的证明
5. **DVN → RPC 池** — 查询 Unichain 状态("此 burn 是否存在?")
6. **RPC 池 → DVN** — 回复"是,burn 存在"*(伪造响应 — 谎言)*
7. **DVN → EndpointV2** — 提交已签名的证明(密码学上有效)
8. **EndpointV2(自身)** — 签名验证通过 ✓
9. **EndpointV2 → OFTAdapter** — 传递消息
10. **OFTAdapter → 攻击者** — 从托管中 release 116,500 rsETH

**漏洞利用之后 — 检测前 46 分钟窗口**

11. **攻击者** — 将 rsETH 作为抵押品存入 Aave
12. **攻击者** — 借出 WETH(~$236M 潜在二级损失)

### 3.2 重要更正:什么不是攻击

一种常见的误解是"攻击者向 DVN 发送了伪造请求"。这是错误的,而这一区分对漏洞分类至关重要。

| 误解 | 实际情况 |
|---|---|
| 攻击者向 DVN 注入了假消息 | DVN 按自己的调度轮询 RPC;攻击者破坏的是数据源 |
| 攻击者伪造了 DVN 签名 | DVN 的签名是真的;被伪造的是它所证明的底层状态 |
| 116,500 rsETH 凭空铸造 | rsETH 是从本应保持锁定的现有托管中 release 出来的 |
| 智能合约存在漏洞 | 所有合约都按规范运作;漏洞在于信任假设 |

### 3.3 准确的一段总结

> 攻击者篡改了 LayerZero Labs 的 DVN 用于状态轮询的 Unichain RPC 节点上的 op-geth 二进制文件,并通过 DDoS 让更高优先级的健康节点瘫痪,迫使 DVN 的故障转移逻辑落到被篡改的节点上。当 DVN 查询 Unichain 寻找 burn 事件时,它收到的是声称 116,500 rsETH 已被销毁的伪造响应 — 但这些事件从未真正发生。DVN 基于这些虚假数据签署了证明,Ethereum 上的 EndpointV2 合约对(真实的)签名进行了密码学验证并接受了(伪造的)消息,rsETH OFTAdapter 从其 Ethereum 托管中向攻击者 release 了 116,500 rsETH。没有新的 rsETH 被铸造;原本作为其他链上影子表示支撑的现有代币被释放给了不配获得该 release 的攻击者。结果是 116,500 rsETH 在没有底层 ETH 抵押的情况下流通。

---

## 4. 启用此次攻击的 OApp 配置

```solidity
// KelpDAO rsETH OFT — 实际配置(基于公开分析)
requiredDVNs:      [0x282b3386571f7f794450d5789911a9804fa346b4]  // LayerZero Labs DVN
requiredDVNCount:  1
optionalDVNs:      []
optionalDVNCount:  0
threshold:         1-of-1

// 高价值资产的行业推荐配置
requiredDVNs:      [DVN_A, DVN_B, DVN_C]  // 3 个独立运营方
requiredDVNCount:  3
threshold:         2-of-3
```

1-of-1 配置意味着攻击者只需欺骗一个验证者的世界观。如果是独立运营方间的 2-of-3,攻击就需要同时入侵三个独立的运营栈。

这一配置风险在漏洞利用发生 15 个月前已在 Aave 治理论坛上被公开提出,但未被改变。

---

## 5. 各层职责分析

| 层 | 发生了什么 | 是否正常运作 | 是否可防止损失 |
|---|---|---|---|
| 智能合约 (`EndpointV2`, `OFTAdapter`) | 验证签名、传递消息 |  是 |  否 — 它们没有办法检测谎言 |
| DVN 服务 | 轮询 RPC,基于响应签名 |  按规范运作但信任了错误数据 |  若有异常检测则有可能 |
| RPC 基础设施 | 两个节点被篡改,两个被 DDoS |  否 |  是 — 多样化的健康节点本可阻止此次攻击 |
| OApp 配置 | 使用 1-of-1 LayerZero Labs DVN |  对资产价值而言不充分 |  是 — 2-of-3 会让攻击难度大大增加 |

漏洞利用之所以成功,是因为**这四个条件全部对齐**。其中任何一项被消除,损失都很可能不会发生。

---

## 6. 漏洞利用后的资金流向

![资金流向:被盗 rsETH 分流到 Aave(冻结)、Arbitrum 冻结(已追回)、THORChain 洗钱路径](/assets/posts/kelpdao-incident/03-fund-flow.svg)

| 目的地 | 数量 | 状态 |
|---|---|---|
| Aave V3 抵押品 (rsETH) | 116,500 rsETH | 在 Aave 上被冻结;存在坏账风险 |
| Arbitrum 治理冻结 | 30,766 ETH (~$71M) | 已追回(待 DAO 投票) |
| THORChain ETH→BTC | ~34,500 ETH (~$80M) | 已洗钱,难以追回 |
| 混币器和 CEX | 余额 | 持续追踪中 |

**归因(Attribution):** 根据 LayerZero、Chainalysis 等机构的链上取证,涉嫌为 DPRK 关联的 Lazarus Group / TraderTraitor。截至原始公告日期,**尚未被 OFAC 或执法机构正式确认**。

---

## 7. 漏洞赏金适用性

此次事件为一整类此前必须从基本原理(first principles)开始论证的发现确立了**可引用的先例(citable precedent)**。下面的方法论可直接迁移到其他跨链协议。

### 7.1 该寻找什么

![狩猎工作流:用于评估 OApp DVN 配置作为漏洞赏金发现的决策树](/assets/posts/kelpdao-incident/04-hunting-workflow.svg)

### 7.2 使用 `cast` 的检查工作流

```bash
# 1. 找到 OApp 的 send/receive 库
cast call $ENDPOINT_V2 \
  "getSendLibrary(address,uint32)(address)" \
  $OAPP_ADDRESS \
  $REMOTE_EID \
  --rpc-url $ETH_RPC

# 2. 拉取 ULN 配置 (CONFIG_TYPE_ULN = 2)
cast call $ENDPOINT_V2 \
  "getConfig(address,address,uint32,uint32)(bytes)" \
  $OAPP_ADDRESS \
  $SEND_LIB \
  $REMOTE_EID \
  2 \
  --rpc-url $ETH_RPC

# 3. 解码返回的 UlnConfig 结构体
# struct UlnConfig {
#     uint64 confirmations;
#     uint8 requiredDVNCount;
#     uint8 optionalDVNCount;
#     uint8 optionalDVNThreshold;
#     address[] requiredDVNs;
#     address[] optionalDVNs;
# }
```

如果 `requiredDVNCount + optionalDVNThreshold` 相对于 OApp 的 TVL 较小 — 尤其是当这些 DVN 地址都解析到同一个运营方时 — 你就有了一个可信的发现。

### 7.3 Foundry PoC 结构

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

contract OAppConfigAudit is Test {
    address constant ENDPOINT_V2 = 0x1a44076050125825900e736c501f859c50fE728c;
    address constant TARGET_OAPP = 0x...;  // 你的审计目标
    uint32  constant REMOTE_EID  = 30320;  // 此例为 Unichain

    function test_singleDVN_isSinglePointOfFailure() public {
        vm.createSelectFork("mainnet");

        bytes memory configBytes = IEndpointV2(ENDPOINT_V2).getConfig(
            TARGET_OAPP,
            getSendLib(),
            REMOTE_EID,
            2  // CONFIG_TYPE_ULN
        );

        UlnConfig memory uln = abi.decode(configBytes, (UlnConfig));

        // 记录发现
        emit log_named_uint("requiredDVNCount", uln.requiredDVNCount);
        emit log_named_uint("optionalDVNThreshold", uln.optionalDVNThreshold);

        // 法定数量过低则告警
        uint256 effectiveThreshold = uln.requiredDVNCount + uln.optionalDVNThreshold;
        assertGt(effectiveThreshold, 1, "Single point of failure detected");
    }
}
```

这样的测试 — 结合 TVL 数据和 KelpDAO 先例 — 足以作为一个可信的"Critical configuration risk"提交到大多数跨链桥漏洞赏金项目中。

### 7.4 在 LayerZero 之外的泛化

只需调整术语,同样的方法论可应用于其他跨链系统:

| 协议 | "法定数量"的等价概念 | 重点关注 |
|---|---|---|
| Wormhole | Guardian set 签名阈值 | 当前为 13-of-19;检查分叉版本 |
| Axelar | 验证者 stake-weighted 阈值 | 质押集中度、验证者重叠 |
| Hyperlane | ISM (Interchain Security Module) 配置 | 降低安全性的自定义 ISM |
| Chainlink CCIP | RMN (Risk Management Network) 配置 | RMN 节点数量、运营方多样性 |
| Across | Relayer / 乐观预言机配置 | 挑战窗口、抵押金额 |

---

## 8. 防御建议

对于协议团队来说,以下是本可阻止此次损失的改动:

1. **多 DVN 法定数量** — 任何 TVL 在约 $10M 以上的资产,至少应使用独立运营方间的 2-of-3。运营额外 DVN 的经济成本相对于所避免的损失而言微不足道。

2. **DVN 运营方多样性** — DVN 应在独立的基础设施上运行:不同的云服务商、不同的地理位置、不同的 RPC 提供商。同一运营方的 DVN 集合提供的是名义上的多样性,而非实质性多样性。

3. **DVN 的 RPC 池多样化** — 每个 DVN 应至少查询 3 个独立 RPC 提供商,并在将查询结果视为权威之前应用共识逻辑。响应交叉验证本可检测出 KelpDAO 的篡改。

4. **DVN 证明的异常检测** — 如果某个 DVN 即将在 Y 分钟内对超过托管价值 X% 的 release 进行证明,则要求人工审批或施加速率限制。

5. **将配置审计列为单独的审查类别** — 智能合约审计不会审查部署后的配置。让它成为一项独立的交付物。

6. **跨链桥层的速率限制** — 在 OFTAdapter 自身中限制每个区块或每个周期可 release 的最大价值。这无法阻止此次攻击,但能极大降低损失。

---

## 9. 关键链上标识

| 项目 | 地址 / 哈希 |
|---|---|
| 漏洞利用交易 | `0x1ae232da212c45f35c1525f851e4c41d529bf18af862d9ce9fd40bf709db4222` |
| LayerZero EndpointV2 (Ethereum) | `0x1a44076050125825900e736c501f859c50fE728c` |
| Kelp rsETH OFTAdapter | `0x85d456B2DfF1fd8245387C0BfB64Dfb700e98Ef3` |
| 被入侵的 DVN | `0x282b3386571f7f794450d5789911a9804fa346b4` (LayerZero Labs) |
| 攻击者钱包 | `0x8B1b6c9A6DB1304000412dd21Ae6A70a82d60D3b` |
| Arbitrum 治理冻结地址 | `0x000000000000000000000000000000000000dA0` |
| Unichain 端点 ID(伪造的 srcEid) | `30320` |
| 伪造的数据包 nonce | `308` |

---

## 10. 对 Web3 漏洞赏金体系的影响


- **它展示了一类不需要深厚 Solidity 专业知识就能发现的漏洞类别。** 漏洞存在于配置数据和基础设施信任假设中 — 这正是与传统渗透测试思维相对应的领域。
- **它确立了可引用的先例。** 以"OApp X 重现了 2026 年 4 月 KelpDAO 事件的条件"形式提交的发现具有相当的分量。
- **狩猎工作流可脚本化。** 用 `cast` 跨数百个 OApp 拉取 DVN 配置,只是一个下午的工作量。
- **攻击面可以泛化。** 同样的方法论应用于 Wormhole、Axelar、Hyperlane、CCIP 等会得到平行的发现。

最重要的概念转变:在 Web3 中,**经过审计的代码只是可信计算基(TCB)的一部分。** 配置、链下验证者、RPC 依赖、预言机提供方、治理多签 — 所有这些都是信任边界的一部分,所有这些都是合法的漏洞赏金领域。KelpDAO 是让这一点变得具体的事件。

---

## 参考资料

- **KelpDAO rsETH / LayerZero 跨链桥安全事件报告**: [KelpDAO rsETH / LayerZero 跨链桥安全事件报告](https://www.sooho.io/articles/kelpdao-rseth-layerzero-%EB%B8%8C%EB%A6%BF%EC%A7%80-%EB%B3%B4%EC%95%88-%EC%82%AC%EA%B3%A0-%EB%A6%AC%ED%8F%AC%ED%8A%B8)