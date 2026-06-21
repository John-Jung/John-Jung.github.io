---
layout: post
title: "Hack The Box — Principal Writeup"
description: "Difficulty: Medium"
date: 2026-06-01
lang: en
permalink: /en/posts/htb-principal/
category: htb
tags: [HackTheBox, Linux, JWT, pac4j-jwt, Authentication Bypass, SSH Certificate, Privilege Escalation]
---

# Principal

>[https://app.hackthebox.com/machines/Principal](https://app.hackthebox.com/machines/Principal)

**Box:** Principal<br>
**Difficulty:** Medium<br>
**OS:** Linux

---

## Table of Contents

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

Identified ports 22 and 8080 running on the target

![](/assets/posts/htb-principal/01.png)


Port 22 — identified OpenSSH version and server OS Ubuntu 13.14
<br>
Port 8080 — identified Jetty web server
<br>
Identified X-Powered-By: pac4j-jwt/6.0.3

![](/assets/posts/htb-principal/02-1.png)

---

## 02 — Web Application & Tech Stack Analysis (pac4j-jwt 6.0.3)

Inspection of /static/js/app.js revealed:
<br>
Token encryption: RSA-OAEP-256 + A128GCM
<br>
Public key endpoint: /api/auth/jwks
<br>
Signing algorithm: RS256
<br>
User claims: sub/role/iss/iat/exp
<br>
Endpoints enumerated

![](/assets/posts/htb-principal/03.png)


TokenManager handles user authentication via <strong>sessionStorage</strong>

![](/assets/posts/htb-principal/03-1.png)

Confirmed that the Users and Settings features in renderNavigation() require Admin privileges

![](/assets/posts/htb-principal/03-2.png)


Public key inspection results:
<br>
kty: RSA → key type: RSA
<br>
e: AQAB (public exponent 65537)
<br>
n: the modulus (very large number)
<br>
kid: enc-key-1 (key identifier)

![](/assets/posts/htb-principal/04.png)


**Why this matters**

Issue: <strong>pac4j-jwt 6.0.3</strong> is affected by CVE-2026-29000
<br>
If the inner token is an unsigned plain JWT (alg: none), step 2 fails to find a signed JWT and returns null
<br>
This causes step 3, the signature verification process, to be skipped entirely
<br>
Result: the token can be forged with role: "ROLE_ADMIN" inside the JWT

---

## 03 — Directory Brute Force

Directory brute force confirmed the /login path, matching what was found in app.js

![](/assets/posts/htb-principal/05.png)

---

## 04 — CVE-2026-29000 pac4j-jwt Authentication Bypass (JWE Token Forgery)

Wrote a Python script to forge the JWT (role: ADMIN, username: pentester)

![](/assets/posts/htb-principal/06-1.png)


Generated a token with ADMIN privileges

![](/assets/posts/htb-principal/07.png)

---

## 05 — Admin Dashboard Access & API Enumeration

Enumerated the ADMIN-only /dashboard using the forged ADMIN/pentester token

![](/assets/posts/htb-principal/09.png)

Identified svc-deploy among admin users as the account tied to SSH certificate authentication

<br>
(Other admin: amorales)

![](/assets/posts/htb-principal/10.png)


Identified admin usernames: admin, svc-deploy, jthompson

![](/assets/posts/htb-principal/11-1.png)


Confirmed SSH access is possible via <strong>"sshCaPath": "/opt/principal/ssh/"</strong> and <strong>"sshCertAuth": "enabled"</strong>

![](/assets/posts/htb-principal/11-2.png)

---

## 06 — Credential Discovery (encryptionKey)

Found "encryptionKey": "D3pl0y_$$H_Now42!" in /api/settings

![](/assets/posts/htb-principal/11-3.png)

---

## 07 — Password Spray & User Flag (SSH as svc-deploy)

Compiled the identified admin usernames

![](/assets/posts/htb-principal/12.png)


Password spray confirmed the identified password belongs to svc-deploy

![](/assets/posts/htb-principal/13.png)


SSH'd in as svc-deploy and obtained the user flag

![](/assets/posts/htb-principal/14.png)

---

## 08 — Privilege Escalation Enumeration (deployers Group & SSH CA)

Inspecting the SSH CA (private key) file showed that root has read/write permissions
<br>
and the deployers group has read access
<br>

<strong>※ Signing with this private key allows root privilege escalation</strong>

![](/assets/posts/htb-principal/15.png)


Confirmed it is a PRIVATE KEY
<br>
TrustedUserCAKeys tells SSH to trust certificates signed by this key
<br>
PermitRootLogin prohibit-password allows root login via key (not just password)

![](/assets/posts/htb-principal/16.png)




---

## 09 — SSH Certificate Forgery to Root

Generated a keypair

![](/assets/posts/htb-principal/17.png)


Signed the generated keypair with the CA (private key)
<br>
Confirmed the generated key was successfully forged with root privileges

![](/assets/posts/htb-principal/18.png)


Used the signed key to access as root → obtained the root flag

![](/assets/posts/htb-principal/19.png)