---
layout: post
title: "Hack The Box — Principal Writeup"
description: "难度: Medium"
date: 2026-06-01
lang: zh
permalink: /zh/posts/htb-principal/
category: htb
tags: [HackTheBox, Linux, JWT, pac4j-jwt, Authentication Bypass, SSH Certificate, Privilege Escalation]
---

# Principal

>[https://app.hackthebox.com/machines/Principal](https://app.hackthebox.com/machines/Principal)

**题目:** Principal<br>
**难度:** Medium<br>
**OS:** Linux

---

## 目录

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

确认目标 URL 上运行的 22、8080 端口

![](/assets/posts/htb-principal/01.png)


端口 22 — 识别出 OpenSSH 版本及服务器操作系统 Ubuntu 13.14
<br>
端口 8080 — 识别出 Jetty Web 服务器
<br>
识别出 X-Powered-By: pac4j-jwt/6.0.3

![](/assets/posts/htb-principal/02-1.png)

---

## 02 — Web Application & Tech Stack Analysis (pac4j-jwt 6.0.3)

检查 /static/js/app.js 后发现：
<br>
Token 加密方式: RSA-OAEP-256 + A128GCM
<br>
公钥路径: /api/auth/jwks
<br>
签名算法: RS256
<br>
用户声明 (claims): sub/role/iss/iat/exp
<br>
枚举出 API 端点

![](/assets/posts/htb-principal/03.png)


TokenManager 通过 <strong>sessionStorage</strong> 处理用户认证

![](/assets/posts/htb-principal/03-1.png)

确认 renderNavigation() 中的 Users 和 Settings 功能需要 Admin 权限

![](/assets/posts/htb-principal/03-2.png)


公钥检查结果：
<br>
kty: RSA → 密钥类型: RSA
<br>
e: AQAB (公钥指数 65537)
<br>
n: the modulus（一个非常大的数）
<br>
kid: enc-key-1（密钥标识符）

![](/assets/posts/htb-principal/04.png)


**为什么这很重要**

问题: <strong>pac4j-jwt 6.0.3</strong> 存在 CVE-2026-29000 漏洞
<br>
如果内层 token 是未签名的普通 JWT (alg: none)，第 2 步会找不到已签名的 JWT 并返回 null
<br>
这会导致第 3 步签名验证过程被完全跳过
<br>
结果: 可以伪造 token，使 JWT 中的 role 变为 "ROLE_ADMIN"

---

## 03 — Directory Brute Force

通过目录爆破确认 /login 路径，与 app.js 中发现的一致

![](/assets/posts/htb-principal/05.png)

---

## 04 — CVE-2026-29000 pac4j-jwt Authentication Bypass (JWE Token Forgery)

编写 Python 脚本伪造 JWT（权限: ADMIN，用户名: pentester）

![](/assets/posts/htb-principal/06-1.png)


生成具有 ADMIN 权限的 token

![](/assets/posts/htb-principal/07.png)

---

## 05 — Admin Dashboard Access & API Enumeration

使用伪造的 ADMIN/pentester token 枚举 ADMIN 权限的 /dashboard

![](/assets/posts/htb-principal/09.png)

确认管理员用户中 svc-deploy 是与 SSH certificate 相关的账户

<br>
（其他管理员: amorales）

![](/assets/posts/htb-principal/10.png)


确认管理员用户名: admin、svc-deploy、jthompson

![](/assets/posts/htb-principal/11-1.png)


通过 <strong>"sshCaPath": "/opt/principal/ssh/"</strong> 和 <strong>"sshCertAuth": "enabled"</strong> 确认可以通过 SSH 访问

![](/assets/posts/htb-principal/11-2.png)

---

## 06 — Credential Discovery (encryptionKey)

在 /api/settings 中发现 "encryptionKey": "D3pl0y_$$H_Now42!"

![](/assets/posts/htb-principal/11-3.png)

---

## 07 — Password Spray & User Flag (SSH as svc-deploy)

整理已识别的管理员用户名

![](/assets/posts/htb-principal/12.png)


密码喷洒结果确认所识别的密码属于 svc-deploy

![](/assets/posts/htb-principal/13.png)


以 svc-deploy 账户通过 SSH 登录并获取 user flag

![](/assets/posts/htb-principal/14.png)

---

## 08 — Privilege Escalation Enumeration (deployers Group & SSH CA)

检查 SSH CA（私钥）文件后发现 root 权限为 read/write
<br>
deployers 组具有 read 权限
<br>

<strong>※ 使用该私钥进行签名即可获取 root 权限</strong>

![](/assets/posts/htb-principal/15.png)


确认为 PRIVATE KEY（私钥）
<br>
TrustedUserCAKeys 让 SSH 信任由该密钥签名的证书
<br>
PermitRootLogin prohibit-password 允许 root 不仅通过密码、也可通过密钥登录

![](/assets/posts/htb-principal/16.png)




---

## 09 — SSH Certificate Forgery to Root

生成密钥对

![](/assets/posts/htb-principal/17.png)


使用 CA（私钥）对生成的密钥对进行签名
<br>
确认生成的密钥已成功伪造为 root 权限

![](/assets/posts/htb-principal/18.png)


使用已签名的密钥以 root 权限登录 → 获取 root flag

![](/assets/posts/htb-principal/19.png)