---
layout: post
title: "Hack The Box — Forest Writeup"
description: "难度：Easy"
date: 2026-06-15
lang: zh
permalink: /zh/posts/htb-forest/
category: htb
tags: [HackTheBox, Windows, Active Directory, AS-REP Roasting, Kerberos, DCSync, ACL Abuse, Pass-the-Hash, BloodHound, Privilege Escalation]
---

# Forest

>[https://app.hackthebox.com/machines/Forest](https://app.hackthebox.com/machines/Forest)

**靶机：** Forest<br>
**难度：** Easy<br>
**OS：** Windows

---

## 目录

- 01 — Reconnaissance (Full Port Scan & Domain Controller Identification)
- 02 — DNS & SMB Enumeration (Null Session)
- 03 — RPC Null Session User Enumeration (enumdomusers)
- 04 — AS-REP Roasting (svc-alfresco — No Kerberos Pre-Auth)
- 05 — Hash Cracking & User Flag (Evil-WinRM as svc-alfresco)
- 06 — ACL Abuse (Account Operators → Exchange Windows Permissions: GenericAll & WriteDacl) → DCSync Attack & Administrator Hash Dump
- 07 — Privilege Escalation to Root (Pass-the-Hash as Administrator)

---

## 01 — Reconnaissance (Full Port Scan & Domain Controller Identification)

通过端口扫描识别出目标为 Windows 系统。

![](/assets/posts/htb-forest/01.png)


通过对主要端口的扫描，确认了服务器版本（Windows Server 2016）、域名、RPC 等信息。

![](/assets/posts/htb-forest/02-1.png)

---

## 02 — DNS & SMB Enumeration (Null Session)

对 53 端口的 DNS 进行枚举。结果确认了负责该域和 zone transfer 的 DC（Domain Controller）。

![](/assets/posts/htb-forest/03-1.png)
![](/assets/posts/htb-forest/03-2.png)

SMBMAP 扫描结果未发现任何有价值的 credential。

![](/assets/posts/htb-forest/04-1.png)
![](/assets/posts/htb-forest/04-2.png)

---

## 03 — RPC Null Session User Enumeration (enumdomusers)

通过 null session 执行 RPC 枚举 → DC 在没有 MS-RPC credential 的情况下返回了域用户。识别出 SM-*、Admin、Guest、Sebastian、Lucinda、svc-alfresco 等用户。

![](/assets/posts/htb-forest/05-1.png)
![](/assets/posts/htb-forest/05-2.png)


---

## 04 — AS-REP Roasting (svc-alfresco — No Kerberos Pre-Auth)

下一步是 <strong>AS-REP Roasting</strong>。如果这些账户中的任意一个启用了 <strong>"Do not require Kerberos pre-authentication"</strong>（无需预身份验证）选项，DC 就会在无需任何凭据（用户名/密码）的情况下，将该用户的 <strong>加密 AS-REP 响应</strong> 提供给我们。随后我们可以拿到该响应，尝试 <strong>离线密码破解</strong>。

![](/assets/posts/htb-forest/06-1.png)
![](/assets/posts/htb-forest/06-2.png)

---

## 05 — Hash Cracking & User Flag (Evil-WinRM as svc-alfresco)

只有 <strong>svc-alfresco</strong> 账户禁用了预身份验证（Pre-Authentication），因此它是唯一可以执行 AS-REP Roasting 的账户。

<br>

那段 `$krb5asrep$23$...` 形式的数据是可以离线破解的 AS-REP 哈希。

<br>

下一步是使用 Hashcat 对其进行破解。

<br>

先将哈希保存到文件，然后使用 Hashcat 的 18200 模式（Kerberos 5 AS-REP, etype 23）配合 rockyou 字典进行攻击。

![](/assets/posts/htb-forest/07-1.png)


破解出的密码为 s3rvice

![](/assets/posts/htb-forest/07-2.png)

使用破解出的密码通过 WinRM 接入，获取 user flag。

![](/assets/posts/htb-forest/08.png)

---

## 06 — ACL Abuse (Account Operators → Exchange Windows Permissions: GenericAll & WriteDacl) → DCSync Attack & Administrator Hash Dump

通过 BloodHound 确认的权限提升链如下。

`svc-alfresco` → `Service Accounts` → `Privileged IT Accounts` → `Account Operators`

- `Account Operators` 对 `Exchange Windows Permissions` 组拥有 `GenericAll` 权限。
- `Exchange Windows Permissions` 组对域对象拥有 `WriteDacl` 权限。
- 因此，我们可以给自己授予 DCSync 权限，复制（DCSync）Administrator 的密码哈希，然后用该哈希以 Administrator 身份登录。
- 之后读取 `root.txt` 即可。

安装 `bloodyAD`。

将 `svc-alfresco` 添加到 `Exchange Windows Permissions` 组以继承 `WriteDacl` 权限，给自己授予 DCSync 权限，再用 `impacket-secretsdump` 转储 Administrator 哈希，将上述过程以链式方式执行。

![](/assets/posts/htb-forest/09.png)

---

## 07 — Privilege Escalation to Root (Pass-the-Hash as Administrator)

使用转储得到的 Administrator 哈希执行 Pass-the-Hash 攻击，通过 Evil-WinRM 接入并获取 root flag。

![](/assets/posts/htb-forest/10.png)