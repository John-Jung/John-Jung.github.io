---
layout: post
title: "Hack The Box — Forest Writeup"
description: "Difficulty: Easy"
date: 2026-06-15
lang: en
permalink: /en/posts/htb-forest/
category: htb
tags: [HackTheBox, Windows, Active Directory, AS-REP Roasting, Kerberos, DCSync, ACL Abuse, Pass-the-Hash, BloodHound, Privilege Escalation]
---

# Forest

>[https://app.hackthebox.com/machines/Forest](https://app.hackthebox.com/machines/Forest)

**Machine:** Forest<br>
**Difficulty:** Easy<br>
**OS:** Windows

---

## Table of Contents

- 01 — Reconnaissance (Full Port Scan & Domain Controller Identification)
- 02 — DNS & SMB Enumeration (Null Session)
- 03 — RPC Null Session User Enumeration (enumdomusers)
- 04 — AS-REP Roasting (svc-alfresco — No Kerberos Pre-Auth)
- 05 — Hash Cracking & User Flag (Evil-WinRM as svc-alfresco)
- 06 — ACL Abuse (Account Operators → Exchange Windows Permissions: GenericAll & WriteDacl) → DCSync Attack & Administrator Hash Dump
- 07 — Privilege Escalation to Root (Pass-the-Hash as Administrator)

---

## 01 — Reconnaissance (Full Port Scan & Domain Controller Identification)

Identified the target as a Windows system through a port scan.

![](/assets/posts/htb-forest/01.png)


Through a scan of the main ports, confirmed the server version (Windows Server 2016), the domain name, RPC, and more.

![](/assets/posts/htb-forest/02-1.png)

---

## 02 — DNS & SMB Enumeration (Null Session)

Enumerated the DNS on port 53. As a result, confirmed the DC (Domain Controller) that handles the domain and zone transfers.

![](/assets/posts/htb-forest/03-1.png)
![](/assets/posts/htb-forest/03-2.png)

The SMBMAP scan did not identify any notable credentials.

![](/assets/posts/htb-forest/04-1.png)
![](/assets/posts/htb-forest/04-2.png)

---

## 03 — RPC Null Session User Enumeration (enumdomusers)

Ran RPC enumeration through a null session → the DC returned domain users without any MS-RPC credentials. Identified the SM-*, Admin, Guest, Sebastian, Lucinda, and svc-alfresco users.

![](/assets/posts/htb-forest/05-1.png)
![](/assets/posts/htb-forest/05-2.png)


---

## 04 — AS-REP Roasting (svc-alfresco — No Kerberos Pre-Auth)

The next step is <strong>AS-REP Roasting</strong>. If any one of these accounts has the <strong>"Do not require Kerberos pre-authentication"</strong> option enabled, the DC will hand us that user's <strong>encrypted AS-REP response</strong> without any credentials (username/password). We can then take that response and attempt <strong>offline password cracking</strong>.

![](/assets/posts/htb-forest/06-1.png)
![](/assets/posts/htb-forest/06-2.png)

---

## 05 — Hash Cracking & User Flag (Evil-WinRM as svc-alfresco)

Only the <strong>svc-alfresco</strong> account has Pre-Authentication disabled, so it is the only account on which AS-REP Roasting can be performed.

<br>

That `$krb5asrep$23$...` data is an AS-REP hash that can be cracked offline.

<br>

The next step is to crack it using Hashcat.

<br>

First save the hash to a file, then run the attack with the rockyou wordlist using Hashcat's 18200 mode (Kerberos 5 AS-REP, etype 23).

![](/assets/posts/htb-forest/07-1.png)


Cracked password: s3rvice

![](/assets/posts/htb-forest/07-2.png)

Accessed via WinRM with the cracked password and obtained the user flag.

![](/assets/posts/htb-forest/08.png)

---

## 06 — ACL Abuse (Account Operators → Exchange Windows Permissions: GenericAll & WriteDacl) → DCSync Attack & Administrator Hash Dump

The privilege escalation chain confirmed with BloodHound is as follows.

`svc-alfresco` → `Service Accounts` → `Privileged IT Accounts` → `Account Operators`

- `Account Operators` has `GenericAll` over the `Exchange Windows Permissions` group.
- The `Exchange Windows Permissions` group has `WriteDacl` over the domain object.
- Therefore, we can grant ourselves DCSync rights, replicate (DCSync) the Administrator's password hash, and then log in as Administrator with that hash.
- After that, we can read `root.txt`.

Install `bloodyAD`.

Chained the process of adding `svc-alfresco` to the `Exchange Windows Permissions` group to inherit `WriteDacl`, granting ourselves DCSync rights, and then dumping the Administrator hash with `impacket-secretsdump`.

![](/assets/posts/htb-forest/09.png)

---

## 07 — Privilege Escalation to Root (Pass-the-Hash as Administrator)

Performed a Pass-the-Hash attack with the dumped Administrator hash to connect via Evil-WinRM and obtain the root flag.

![](/assets/posts/htb-forest/10.png)