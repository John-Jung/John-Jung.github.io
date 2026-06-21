---
layout: post
title: "Hack The Box — Principal Writeup"
description: "난이도: Medium"
date: 2026-06-01
lang: ko
permalink: /ko/posts/htb-principal/
category: htb
tags: [HackTheBox, Linux, JWT, pac4j-jwt, Authentication Bypass, SSH Certificate, Privilege Escalation]
---

# Principal

>[https://app.hackthebox.com/machines/Principal](https://app.hackthebox.com/machines/Principal)

**문제:** Principal<br>
**난이도:** Medium<br>
**OS:** Linux

---

## 목차

- 01 — Reconnaissance
- 02 — Web Application & Tech Stack Analysis (pac4j-jwt 6.0.3)
- 03 — Directory Brute Force
- 04 — CVE-2026-29000 pac4j-jwt Authentication Bypass (JWE Token Forgery)
- 05 — Admin Dashboard Access & API Enumeration
- 06 — Credential Discovery (encryptionKey)
- 07 — Password Spray & User Flag (SSH as svc-deploy)
- 08 — Privilege Escalation Enumeration (deployers Group & SSH CA)
- 09 — SSH Certificate Forgery to Root

---

## 01 — Reconnaissance

해당 URL에 서비스중인 22, 8080 포트 확인

![](/assets/posts/htb-principal/01.png)


22포트에서 OPENSSH 버전 및 서버 OS Ubuntu 13.14 버전 식별
<br>
8080포트에서 Jetty 웹서버 식별
<br>
X-Powered-By: pac4j-jwt/6.0.3 버전 식별

![](/assets/posts/htb-principal/02-1.png)

---

## 02 — Web Application & Tech Stack Analysis (pac4j-jwt 6.0.3)

/static/js/app.js을 확인 결과
<br>
토큰 암호화 방식 RSA-OAEP-256 + A128GCM
<br>
공개키 경로 /api/auth/jwks
<br>
서명 방식 RS256
<br>
사용자 권한 sub/role/iss/iat/exp
<br>
엔드포인트 식별

![](/assets/posts/htb-principal/03.png)


TokenManager에서 사용자 <strong>sessionStorage</strong>을 통해 사용자 인증을 처리

![](/assets/posts/htb-principal/03-1.png)

renderNavigation()에서 Users와 Settings 기능은 Admin 권한이 필요한 것을 확인

![](/assets/posts/htb-principal/03-2.png)


공개키 확인 결과 
<br>
kty: RSA -> 키 타입: RSA
<br>
e: AQAB (공개 지수 65537)
<br>
n: the modulus 매우 큰 수
<br>
kid: enc-key-1 (키 식별자)

![](/assets/posts/htb-principal/04.png)


**이것이 중요한 이유**

문제: <strong>pac4j-jwt 6.0.3</strong>에 CVE-2026-29000 취약점이 존재
<br>
내부 토큰이 서명되지 않은 일반 JWT(alg: none)라면, 2단계에서 서명된 JWT를 찾지 못해 null이 반환
<br>
그러면 3단계인 서명 검증 과정 자체가 SKIP
<br>
그 결과: 토큰을 위조하여 JWT 안에 role: "ROLE_ADMIN" 이 가능

---

## 03 — Directory Brute Force

Directory Brute force를 통해 app.js에서 확인한 것과 동일하게 /login 경로를 확인

![](/assets/posts/htb-principal/05.png)

---

## 04 — CVE-2026-29000 pac4j-jwt Authentication Bypass (JWE Token Forgery)

JWT 위변조 파이썬 코드 작성 (권한 ADMIN, 이름 pentester)

![](/assets/posts/htb-principal/06-1.png)


ADMIN 권한의 토큰 생성

![](/assets/posts/htb-principal/07.png)

---

## 05 — Admin Dashboard Access & API Enumeration

변조한 ADMIN/pentester 토큰을 사용하여 ADMIN 권한의 /dashboard 열거

![](/assets/posts/htb-principal/09.png)

관리자 사용자 중에 svc-deploy가 SSH certificate이랑 관련된 계정임을 확인

<br>
(다른 관리자: amorales)

![](/assets/posts/htb-principal/10.png)


관리자 명 확인 admin, svc-deploy, jthompson

![](/assets/posts/htb-principal/11-1.png)


<strong>"sshCaPath": "/opt/principal/ssh/"</strong>와 <strong>"sshCertAuth": "enabled"</strong>로 SSH 접근이 가능한 것을 확인

![](/assets/posts/htb-principal/11-2.png)

---

## 06 — Credential Discovery (encryptionKey)

/api/settings에서 "encryptionKey": "D3pl0y_$$H_Now42!" 확인

![](/assets/posts/htb-principal/11-3.png)

---

## 07 — Password Spray & User Flag (SSH as svc-deploy)

식별된 관리자 사용자명 정리

![](/assets/posts/htb-principal/12.png)


password spray 결과 식별된 비밀번호의 사용자는 svc-deploy 인 것을 확인

![](/assets/posts/htb-principal/13.png)


svc-deploy 계정 SSH로 접근하여 user flag 획득

![](/assets/posts/htb-principal/14.png)

---

## 08 — Privilege Escalation Enumeration (deployers Group & SSH CA)

SSH CA(개인키) 파일 확인 결과 root 권한이 read/write
<br>
deployers 권한이 read 할 수 있는 것을 확인
<br>

<strong>※ 해당 개인키로 사인한다면 root 권한 획득 가능</strong>

![](/assets/posts/htb-principal/15.png)


PRIVATE KEY로 확인하여 개인키임을 확인
<br>
TrustedUserCAKeys로 ssh는 해당키로 사인된 증명을 신뢰
<br>
PermitRootLogin prohibit-password로 root 권한 비밀번호뿐만 아니라 키로 로그인 가능

![](/assets/posts/htb-principal/16.png)




---

## 09 — SSH Certificate Forgery to Root

키페어 생성

![](/assets/posts/htb-principal/17.png)


생성한 키페어를 CA(개인키)로 Sign
<br>
생성한 키가 정상적으로 root 권한으로 변조된 것을 확인

![](/assets/posts/htb-principal/18.png)


Sign한 키로 root 권한 접근 → root flag 획득

![](/assets/posts/htb-principal/19.png)