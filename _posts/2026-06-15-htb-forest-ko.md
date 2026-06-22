---
layout: post
title: "Hack The Box — Forest Writeup"
description: "난이도: Easy"
date: 2026-06-15
lang: ko
permalink: /ko/posts/htb-forest/
category: htb
tags: [HackTheBox, Windows, Active Directory, AS-REP Roasting, Kerberos, DCSync, ACL Abuse, Pass-the-Hash, BloodHound, Privilege Escalation]
---

# Forest

>[https://app.hackthebox.com/machines/Forest](https://app.hackthebox.com/machines/Forest)

**문제:** Forest<br>
**난이도:** Easy<br>
**OS:** Windows

---

## 목차

- 01 — Reconnaissance (Full Port Scan & Domain Controller Identification)
- 02 — DNS & SMB Enumeration (Null Session)
- 03 — RPC Null Session User Enumeration (enumdomusers)
- 04 — AS-REP Roasting (svc-alfresco — No Kerberos Pre-Auth)
- 05 — Hash Cracking & User Flag (Evil-WinRM as svc-alfresco)
- 06 — ACL Abuse (Account Operators → Exchange Windows Permissions: GenericAll & WriteDacl) → DCSync Attack & Administrator Hash Dump
- 07 — Privilege Escalation to Root (Pass-the-Hash as Administrator)

---

## 01 — Reconnaissance (Full Port Scan & Domain Controller Identification)

포트 스캔을 통해 대상이 Windows 시스템임을 식별

![](/assets/posts/htb-forest/01.png)


주요 포트 스캔을 통해 서버 버전 win2016, 도메인 네임, RPC 등을 확인

![](/assets/posts/htb-forest/02-1.png)

---

## 02 — DNS & SMB Enumeration (Null Session)

53포트의 DNS를 열거. 그 결과 DC(Domain Controller)가 도메인과 zone transfer를 실행
하는 것으로 확인

![](/assets/posts/htb-forest/03-1.png)
![](/assets/posts/htb-forest/03-2.png)

SMBMAP 스캔 결과 특별한 credential은 식별되지 않음

![](/assets/posts/htb-forest/04-1.png)
![](/assets/posts/htb-forest/04-2.png)

---

## 03 — RPC Null Session User Enumeration (enumdomusers)

null session을 통해 RPC 열거실행 -> DC가 MS-RPC credential 없이 도메인 유저를 가져
옴. SM-*, Admin, Guest, Sebastian, Lucinda, svc-alfresco 유저를 식별

![](/assets/posts/htb-forest/05-1.png)
![](/assets/posts/htb-forest/05-2.png)


---

## 04 — AS-REP Roasting (svc-alfresco — No Kerberos Pre-Auth)

다음 단계는 <strong>AS-REP Roasting</strong> 만약 이 계정들 중 하나라도 <strong>"Do not require Kerberos</strong>
<strong>pre-authentication(사전 인증 필요 없음)"</strong> 옵션이 설정되어 있다면, DC는 우리에게 해당
사용자의 <strong>암호화된 AS-REP 응답</strong>을 자격 증명(아이디/비밀번호) 없이 제공하게 된다. 그
리고 우리는 그 응답을 가져와 <strong>오프라인에서 비밀번호 크래킹</strong>을 시도할 수 있다.

![](/assets/posts/htb-forest/06-1.png)
![](/assets/posts/htb-forest/06-2.png)

---

## 05 — Hash Cracking & User Flag (Evil-WinRM as svc-alfresco)

<strong>svc-alfresco</strong> 계정만 사전 인증(Pre-Authentication)이 비활성화되어 있으므로, AS-REP
Roasting을 수행할 수 있는 유일한 계정이다.

<br>

저 `$krb5asrep$23$...` 형태의 데이터는 오프라인으로 크래킹할 수 있는 AS-REP 해시다.

<br>

다음 단계는 Hashcat을 사용해 이를 크래킹

<br>

먼저 해시를 파일에 저장한 뒤, Hashcat의 18200 모드(Kerberos 5 AS-REP, etype 23) 를
사용하여 rockyou 사전으로 공격을 수행

![](/assets/posts/htb-forest/07-1.png)


크래킹한 비밀번호 s3rvice

![](/assets/posts/htb-forest/07-2.png)

크래킹한 비밀번호로 winrm으로 접근하여 user flag획득

![](/assets/posts/htb-forest/08.png)

---

## 06 — ACL Abuse (Account Operators → Exchange Windows Permissions: GenericAll & WriteDacl) → DCSync Attack & Administrator Hash Dump

BloodHound로 확인한 권한 상승 체인은 다음과 같다.

`svc-alfresco` → `Service Accounts` → `Privileged IT Accounts` → `Account Operators`

- `Account Operators`는 `Exchange Windows Permissions` 그룹에 대해 `GenericAll` 권한을 가진다.
- `Exchange Windows Permissions` 그룹은 도메인 객체에 대해 `WriteDacl` 권한을 가진다.
- 따라서 자신에게 DCSync 권한을 부여하고, Administrator의 비밀번호 해시를 복제(DCSync)한 뒤, 그 해시로 Administrator로 로그인할 수 있다.
- 이후 `root.txt`를 읽으면 된다.

`bloodyAD`를 설치한다.

`svc-alfresco`를 `Exchange Windows Permissions` 그룹에 추가해 `WriteDacl` 권한을 상속받고, 자신에게 DCSync 권한을 부여한 뒤, `impacket-secretsdump`로 Administrator 해시를 덤프하는 과정을 체인으로 실행했다.

![](/assets/posts/htb-forest/09.png)

---

## 07 — Privilege Escalation to Root (Pass-the-Hash as Administrator)

덤프한 Administrator 해시로 Pass-the-Hash 공격을 수행해 Evil-WinRM에 접속하고 root flag를 획득했다.

![](/assets/posts/htb-forest/10.png)