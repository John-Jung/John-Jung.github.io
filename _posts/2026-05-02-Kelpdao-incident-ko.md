---
layout: post
title: "KelpDAO 사고 리뷰"
description: "보안 사고 분석"
date: 2026-05-02
lang: ko
permalink: /ko/posts/kelpdao-incident/
category: research
tags: [web3, research]
---

# KelpDAO rsETH × LayerZero 브릿지 익스플로잇

**인시던트 발생일:** 2026-04-18 17:35 UTC<br>
**총 손실 규모:** 116,500 rsETH (~USD 292M)<br>
**버그 클래스:** 오프체인 인프라 침해를 통한 크로스체인 메시지 검증 실패<br>



## TL;DR

공격자는 단일 DVN(검증자)이 의존하던 RPC 인프라를 침해함으로써 KelpDAO의 LayerZero 브릿지에서 116,500 rsETH(~USD 292M)를 인출했다. 모든 스마트 컨트랙트는 명세대로 동작했고, 모든 암호학적 검증도 통과했다. 시스템이 실패한 이유는, 그만한 수준의 신뢰를 받을 자격이 없는 오프체인 인프라에 신뢰가 부여되어 있었기 때문이다.

이 사건은 Solidity 버그가 아니다. 설정과 인프라의 신뢰 경계(trust-boundary)에서 발생한 실패이며, 전통적인 침투 테스트 방법론에 깔끔하게 매핑되는 버그 클래스다. 

---

## 1. 배경 개념

### 1.1 rsETH란?

rsETH는 KelpDAO가 발행하는 LRT(Liquid Restaking Token, 유동 리스테이킹 토큰)다. 파생 경로는 다음과 같다:

```
ETH → 이더리움에서 스테이킹 → EigenLayer를 통해 리스테이킹 → 영수증 토큰으로 rsETH 발행
```

영수증 토큰인 rsETH는 대출 시장(Aave, Spark, Fluid)에서 담보로 자유롭게 사용되거나 DEX에서 거래될 수 있다. rsETH의 경제적 가치는 스테이킹 및 리스테이킹 컨트랙트에 잠긴 기초 자산 ETH에 의해 뒷받침된다.

### 1.2 LayerZero OFT란?

OFT(Omnichain Fungible Token)는 체인 간 이동이 가능한 토큰을 위한 LayerZero의 표준이다. 모델은 다음과 같다:

- 하나의 **홈 체인**(rsETH의 경우 Ethereum)이 정식 토큰을 에스크로 컨트랙트에 보관한다
- 다른 체인들은 홈 체인의 에스크로와 mint/burn 쌍을 이루는 **섀도우 표현(shadow representation)**을 보관한다
- Unichain에서 Ethereum으로 rsETH 이동: Unichain에서 burn → Ethereum 에스크로에서 release
- Ethereum에서 Unichain으로 rsETH 이동: Ethereum 에스크로에 lock → Unichain에서 mint

모든 체인의 총 공급량은 항상 에스크로에 잠긴 양과 일치해야 한다. 이 불변성이 깨지면 "백킹 없는(unbacked)" 토큰이 생긴다.

### 1.3 DVN이란?

DVN(Decentralized Verifier Network)은 블록체인을 감시하면서 크로스체인 이벤트에 대한 어테스테이션을 서명하는 **오프체인 서비스**다. 스마트 컨트랙트가 아니라 개인 키를 보유한 서버 프로세스다.

```
DVN의 역할:  체인 A 감시 → 관련 이벤트 확인 → "이 일이 발생함을 증명한다" 서명 →
            체인 B에 서명 제출 → 체인 B가 서명 검증 후 동작
```

OApp(LayerZero 애플리케이션)은 메시지가 수락되기 전에 여러 DVN의 서명을 요구할 수 있다. 이 임계값을 **정족수(quorum)**라 부른다:

- **1-of-1 정족수** — 단일 DVN의 서명만으로 충분 (단일 장애점)
- **2-of-3 정족수** — 3개 중 최소 2개의 DVN이 동의해야 함 (1개 침해에 대한 복원력 확보)

KelpDAO의 rsETH OApp은 1-of-1을 사용하고 있었다.

### 1.4 RPC란?

RPC(Remote Procedure Call) 엔드포인트는 블록체인 노드가 노출하는 HTTP API다. 오프체인 서비스(지갑, DVN, 인덱서)가 체인 상태를 조회하는 통로다.

**RPC는 체인별로 존재한다.** Ethereum에는 Ethereum RPC가, Unichain에는 Unichain RPC가 있다. LayerZero 자체는 RPC가 없는데, LayerZero가 블록체인이 아니라 여러 체인 위의 스마트 컨트랙트와 오프체인 DVN 서비스의 조합이기 때문이다.

Ethereum ↔ Unichain 브릿지를 서비스하는 DVN은 양쪽의 이벤트를 추적하기 위해 Ethereum RPC와 Unichain RPC를 모두 조회한다.

---

## 2. 3계층 아키텍처

이 시스템은 신뢰 속성과 공격 표면이 각기 다른 3개의 계층으로 구성된다.

![3계층 아키텍처: 온체인 컨트랙트는 DVN을 신뢰하고, DVN은 RPC 계층을 신뢰한다](/assets/posts/kelpdao-incident/01-three-layer-architecture.svg)

각 계층은 자신보다 아래 계층을 신뢰한다. 온체인 코드는 DVN의 서명을 신뢰한다. DVN은 RPC의 응답을 신뢰한다. RPC는 자신의 노드 바이너리를 신뢰한다. **공격은 가장 낮은 계층에서 신뢰의 사슬을 끊었고, 정상적으로 동작하는 시스템들을 통해 위쪽으로 전파됐다.**

---

## 3. 공격 흐름

### 3.1 공격자가 실제로 한 일

![공격 시퀀스: 공격자가 RPC를 변조하고, DVN이 위조된 어테스테이션에 서명하며, EndpointV2가 이를 수락해 OFTAdapter가 116,500 rsETH를 release함](/assets/posts/kelpdao-incident/02-attack-sequence.svg)

**공격 사전 준비 — 인프라 준비 단계**

1. **공격자 → RPC 풀** — 2개 노드의 op-geth를 변조된 바이너리로 교체
2. **공격자 → RPC 풀** — 더 높은 우선순위의 정상 노드 2개를 DDoS로 마비
   - *결과: DVN의 페일오버 로직이 변조된 노드로 향함*

**공격 실행**

3. **공격자 → EndpointV2** — 위조된 패킷으로 `lzReceive()` 호출 (Unichain에서 burn이 발생했다고 주장)
4. **EndpointV2 → DVN** — 이 패킷에 대한 어테스테이션 요청
5. **DVN → RPC 풀** — Unichain 상태 조회 ("이 burn이 실제로 존재하는가?")
6. **RPC 풀 → DVN** — "예, burn 존재함" 응답 *(위조된 응답 — 거짓말)*
7. **DVN → EndpointV2** — 서명된 어테스테이션 제출 (암호학적으로 유효)
8. **EndpointV2 (자체)** — 서명 검증 통과 ✓
9. **EndpointV2 → OFTAdapter** — 메시지 전달
10. **OFTAdapter → 공격자** — 에스크로에서 116,500 rsETH release

**익스플로잇 이후 — 탐지까지의 46분 윈도우**

11. **공격자** — rsETH를 Aave에 담보로 예치
12. **공격자** — WETH 차입 (~$236M 잠재적 2차 손실)

### 3.2 중요한 정정: 무엇이 공격이 아니었는가

흔한 오해 중 하나는 "공격자가 DVN에 위조된 요청을 보냈다"는 것이다. 이는 잘못된 설명이며, 버그 분류 측면에서 이 차이는 매우 중요하다.

| 오해 | 실제 |
|---|---|
| 공격자가 DVN에 가짜 메시지를 주입했다 | DVN은 자체 스케줄에 따라 RPC를 폴링한다; 공격자가 침해한 것은 데이터 소스다 |
| 공격자가 DVN의 서명을 위조했다 | DVN의 서명은 진짜였다; 위조된 것은 그 서명이 어테스트한 기저 상태였다 |
| 116,500 rsETH가 무에서 새로 발행됐다 | rsETH는 잠겨 있어야 했던 기존 에스크로에서 release됐다 |
| 스마트 컨트랙트에 취약점이 있었다 | 모든 컨트랙트는 명세대로 동작했다; 버그는 신뢰 가정에 있었다 |

### 3.3 정확한 한 문단 요약

> 공격자는 LayerZero Labs의 DVN이 상태 조회를 위해 폴링하던 Unichain RPC 노드들의 op-geth 바이너리를 변조했고, DVN의 페일오버 로직이 변조된 노드로 향하도록 더 높은 우선순위의 정상 노드들을 DDoS 공격으로 마비시켰다. DVN이 burn 이벤트를 찾기 위해 Unichain을 조회했을 때, 실제로는 일어나지 않았던 116,500 rsETH 소각 이벤트가 발생했다는 위조된 응답을 받았다. DVN은 이 거짓 데이터를 기반으로 어테스테이션에 서명했고, Ethereum의 EndpointV2 컨트랙트는 (진짜) 서명을 암호학적으로 검증한 뒤 (위조된) 메시지를 수락했다. rsETH OFTAdapter는 Ethereum 에스크로에서 116,500 rsETH를 공격자에게 release했다. 새로운 rsETH가 mint된 것이 아니라, 다른 체인의 섀도우 표현을 백킹하던 기존 토큰이 그 release를 받을 자격이 없는 공격자에게 풀린 것이다. 그 결과 116,500 rsETH가 기초 ETH 담보 없이 유통되게 됐다.

---

## 4. 이 사건을 가능하게 한 OApp 설정

```solidity
// KelpDAO rsETH OFT — 실제 설정 (공개 분석 기반)
requiredDVNs:      [0x282b3386571f7f794450d5789911a9804fa346b4]  // LayerZero Labs DVN
requiredDVNCount:  1
optionalDVNs:      []
optionalDVNCount:  0
threshold:         1-of-1

// 고가치 자산을 위한 업계 권장 설정
requiredDVNs:      [DVN_A, DVN_B, DVN_C]  // 독립 운영자 3개
requiredDVNCount:  3
threshold:         2-of-3
```

1-of-1 설정은 공격자가 단 하나의 검증자의 세계관만 속이면 됐다는 것을 의미한다. 독립 운영자 간 2-of-3였다면 공격자는 세 개의 별개 운영 스택을 동시에 침해해야 했을 것이다.

이 설정 리스크는 익스플로잇 발생 15개월 전 Aave 거버넌스 포럼에서 공개적으로 제기된 바 있다. 변경되지 않았다.

---

## 5. 계층별 책임 분석

| 계층 | 발생한 일 | 정상 동작 여부 | 손실 방지 가능 여부 |
|---|---|---|---|
| 스마트 컨트랙트 (`EndpointV2`, `OFTAdapter`) | 서명 검증, 메시지 전달 |  예 |  아니오 — 거짓을 탐지할 방법이 없었다 |
| DVN 서비스 | RPC 폴링, 응답 기반 서명 |  명세대로 동작했지만 잘못된 데이터를 신뢰함 |  이상 탐지가 있었다면 가능 |
| RPC 인프라 | 노드 2개 변조, 2개 DDoS |  아니오 |  예 — 다양한 정상 노드가 있었다면 막을 수 있었다 |
| OApp 설정 | 1-of-1 LayerZero Labs DVN 사용 |  자산 가치 대비 부족 |  예 — 2-of-3였다면 공격이 훨씬 어려웠을 것 |

익스플로잇은 **네 가지 조건이 모두 정렬됐기 때문에** 성공했다. 이 중 하나만 제거되었어도 손실은 발생하지 않았을 가능성이 높다.

---

## 6. 익스플로잇 이후 자금 흐름

![자금 흐름: 탈취된 rsETH는 Aave(동결), Arbitrum 동결(회수), THORChain 세탁 경로로 분기됨](/assets/posts/kelpdao-incident/03-fund-flow.svg)

| 목적지 | 금액 | 상태 |
|---|---|---|
| Aave V3 담보 (rsETH) | 116,500 rsETH | Aave에서 동결; 부실 채권 리스크 |
| Arbitrum 거버넌스 동결 | 30,766 ETH (~$71M) | 회수됨 (DAO 투표 대기) |
| THORChain ETH→BTC | ~34,500 ETH (~$80M) | 세탁됨, 회수 어려움 |
| 믹서 및 CEX | 잔여분 | 추적 진행 중 |

**귀속(Attribution):** LayerZero, Chainalysis 등의 온체인 포렌식에 근거하여 DPRK 연계 Lazarus Group / TraderTraitor가 의심되고 있다. 본 불레틴 작성 시점 기준으로 OFAC이나 사법기관에 의해 **공식적으로 확인되지는 않았다.**

---

## 7. 버그 바운티 적용 가능성

이 사건은 그동안 처음부터(first principles) 논증해야 했던 한 부류의 발견에 대해 **인용 가능한 선례(citable precedent)**를 확립한다. 아래 방법론은 다른 크로스체인 프로토콜에도 직접 이전 가능하다.

### 7.1 무엇을 헌팅할 것인가

![헌팅 워크플로우: OApp DVN 설정을 버그 바운티 발견으로 평가하기 위한 의사결정 트리](/assets/posts/kelpdao-incident/04-hunting-workflow.svg)

### 7.2 `cast`을 활용한 점검 워크플로우

```bash
# 1. OApp의 send/receive 라이브러리 찾기
cast call $ENDPOINT_V2 \
  "getSendLibrary(address,uint32)(address)" \
  $OAPP_ADDRESS \
  $REMOTE_EID \
  --rpc-url $ETH_RPC

# 2. ULN 설정 가져오기 (CONFIG_TYPE_ULN = 2)
cast call $ENDPOINT_V2 \
  "getConfig(address,address,uint32,uint32)(bytes)" \
  $OAPP_ADDRESS \
  $SEND_LIB \
  $REMOTE_EID \
  2 \
  --rpc-url $ETH_RPC

# 3. 반환된 UlnConfig 구조체 디코딩
# struct UlnConfig {
#     uint64 confirmations;
#     uint8 requiredDVNCount;
#     uint8 optionalDVNCount;
#     uint8 optionalDVNThreshold;
#     address[] requiredDVNs;
#     address[] optionalDVNs;
# }
```

`requiredDVNCount + optionalDVNThreshold`가 OApp의 TVL 대비 작다면 — 특히 DVN 주소들이 단일 운영자로 귀결된다면 — 신뢰할 만한 발견이 된다.

### 7.3 Foundry PoC 구조

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

contract OAppConfigAudit is Test {
    address constant ENDPOINT_V2 = 0x1a44076050125825900e736c501f859c50fE728c;
    address constant TARGET_OAPP = 0x...;  // 감사 대상
    uint32  constant REMOTE_EID  = 30320;  // 이 사건에서는 Unichain

    function test_singleDVN_isSinglePointOfFailure() public {
        vm.createSelectFork("mainnet");

        bytes memory configBytes = IEndpointV2(ENDPOINT_V2).getConfig(
            TARGET_OAPP,
            getSendLib(),
            REMOTE_EID,
            2  // CONFIG_TYPE_ULN
        );

        UlnConfig memory uln = abi.decode(configBytes, (UlnConfig));

        // 발견 사항 기록
        emit log_named_uint("requiredDVNCount", uln.requiredDVNCount);
        emit log_named_uint("optionalDVNThreshold", uln.optionalDVNThreshold);

        // 정족수가 위험할 정도로 낮으면 플래그
        uint256 effectiveThreshold = uln.requiredDVNCount + uln.optionalDVNThreshold;
        assertGt(effectiveThreshold, 1, "Single point of failure detected");
    }
}
```

이런 테스트는 — TVL 데이터와 KelpDAO 선례와 결합되었을 때 — 대부분의 브릿지 버그 바운티 프로그램에서 "Critical configuration risk" 제출로 인정받기에 충분하다.

### 7.4 LayerZero 외 일반화

같은 방법론은 어휘만 바꾸면 다른 크로스체인 시스템에도 적용 가능하다:

| 프로토콜 | "정족수"에 해당하는 개념 | 살펴볼 것 |
|---|---|---|
| Wormhole | Guardian set 서명 임계값 | 현재 13-of-19; 포크 확인 |
| Axelar | 검증자 stake-weighted 임계값 | 스테이크 집중도, 검증자 중복 |
| Hyperlane | ISM (Interchain Security Module) 설정 | 보안을 다운그레이드하는 커스텀 ISM |
| Chainlink CCIP | RMN (Risk Management Network) 설정 | RMN 노드 수, 운영자 다양성 |
| Across | Relayer / optimistic oracle 설정 | 챌린지 윈도우, 본딩 금액 |

---

## 8. 방어 권장사항

프로토콜 팀들에게, 이 손실을 막을 수 있었을 변경사항들이다:

1. **다중 DVN 정족수** — TVL 약 $10M 이상의 자산에 대해서는 독립 운영자 간 최소 2-of-3가 필요하다. 추가 DVN을 운영하는 경제적 비용은 방지되는 손실에 비해 미미하다.

2. **DVN 운영자 다양성** — DVN들은 독립적인 인프라에서 운영되어야 한다: 다른 클라우드 제공자, 다른 지리적 위치, 다른 RPC 제공자. 동일 운영자로 구성된 DVN 세트는 명목상의 다양성일 뿐 실질적 다양성이 아니다.

3. **DVN의 RPC 풀 다양화** — 각 DVN은 최소 3개의 독립 RPC 제공자를 조회하고, 응답을 권위 있는 것으로 취급하기 전에 합의 로직을 적용해야 한다. 응답 교차 검증이 있었다면 KelpDAO의 변조를 탐지했을 것이다.

4. **DVN 어테스테이션에 대한 이상 탐지** — DVN이 Y분 이내에 에스크로 가치의 X% 이상 release를 어테스트하려고 한다면, 사람의 승인을 요구하거나 레이트 리밋을 적용해야 한다.

5. **별도 리뷰 카테고리로서의 설정 감사** — 스마트 컨트랙트 감사는 배포 후 설정을 검토하지 않는다. 이를 별개의 산출물로 분리하라.

6. **브릿지 계층의 레이트 리미팅** — OFTAdapter 자체에서 블록당 또는 에포크당 release되는 최대 가치를 제한하라. 이것이 공격을 막지는 못하더라도 손실을 극적으로 줄였을 것이다.

---

## 9. 주요 온체인 식별자

| 항목 | 주소 / 해시 |
|---|---|
| 익스플로잇 트랜잭션 | `0x1ae232da212c45f35c1525f851e4c41d529bf18af862d9ce9fd40bf709db4222` |
| LayerZero EndpointV2 (Ethereum) | `0x1a44076050125825900e736c501f859c50fE728c` |
| Kelp rsETH OFTAdapter | `0x85d456B2DfF1fd8245387C0BfB64Dfb700e98Ef3` |
| 침해된 DVN | `0x282b3386571f7f794450d5789911a9804fa346b4` (LayerZero Labs) |
| 공격자 지갑 | `0x8B1b6c9A6DB1304000412dd21Ae6A70a82d60D3b` |
| Arbitrum 거버넌스 동결 주소 | `0x000000000000000000000000000000000000dA0` |
| Unichain 엔드포인트 ID (위조된 srcEid) | `30320` |
| 위조된 패킷 nonce | `308` |

---

## 10. Web3 버그 바운티로서의 시사점

- **깊은 Solidity 전문성 없이도 발견할 수 있는 버그 클래스를 보여준다.** 버그는 설정 데이터와 인프라 신뢰 가정 안에 살고 있다 — 전통적인 펜테스트 사고방식이 그대로 통하는 영역이다.
- **인용 가능한 선례를 확립한다.** "OApp X는 2026년 4월 KelpDAO 사건의 조건을 재현한다"라는 형태의 제출은 상당한 무게를 가진다.
- **헌팅 워크플로우는 스크립트 가능하다.** 수백 개의 OApp에서 DVN 설정을 가져오는 것은 `cast`만으로 한 오후의 작업이다.
- **공격 표면은 일반화된다.** 같은 방법론을 Wormhole, Axelar, Hyperlane, CCIP 등에 적용하면 평행한 발견들이 나온다.

가장 중요한 개념적 전환: Web3에서 **감사된 코드는 신뢰 컴퓨팅 베이스(TCB)의 한 조각일 뿐이다.** 설정, 오프체인 검증자, RPC 의존성, 오라클 제공자, 거버넌스 멀티시그 — 이 모두가 신뢰 경계의 일부이며, 모두 정당한 버그 바운티 영역이다. KelpDAO는 이를 구체화한 사건이다.

---

## Reference

- **KelpDAO rsETH / LayerZero 브릿지 보안 사고 리포트**: [KelpDAO rsETH / LayerZero 브릿지 보안 사고 리포트](https://www.sooho.io/articles/kelpdao-rseth-layerzero-%EB%B8%8C%EB%A6%BF%EC%A7%80-%EB%B3%B4%EC%95%88-%EC%82%AC%EA%B3%A0-%EB%A6%AC%ED%8F%AC%ED%8A%B8)
