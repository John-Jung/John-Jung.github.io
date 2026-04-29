---
layout: post
title: "Hack The Box — DevArea Writeup"
description: "Difficulty: Medium"
date: 2026-04-29
lang: en
permalink: /en/posts/htb-devarea/
category: htb
tags: [HackTheBox, Linux, SUID, Privilege Escalation]
---

# DevArea

>https://app.hackthebox.com/machines/DevArea

**Machine:** DevArea<br>
**Difficulty:** Medium<br>
**OS:** Linux

---

## Table of Contents

- 01 — Reconnaissance
- 02 — FTP Anonymous Login & JAR Analysis
- 03 — XOP/MTOM SSRF via CVE-2022-46364
- 04 — Hoverfly Authentication
- 05 — Hoverfly Middleware RCE (CVE-2025-54123)
- 06 — User Flag
- 07 — Privilege Escalation Enumeration
- 08 — Bash Binary Swap to Root

---

## 01 — Reconnaissance

Full port scan across all ports.

![](https://velog.velcdn.com/images/wearetheone/post/2ce9b967-8589-4712-b9f5-1b43030f24da/image.png)


Service version detection.

![](https://velog.velcdn.com/images/wearetheone/post/31be662e-1b69-4c8e-9c5e-3e70be602dad/image.png)


### Recon results

- **Port 21** — vsftpd 3.0.5 (anonymous login allowed, pub/ directory exposed)
- **Port 22** — OpenSSH 9.6p1
- **Port 80** — Apache 2.4.58 (redirects to devarea.htb)
- **Port 8080** — Jetty 9.4.27 (likely Apache CXF)
- **Port 8500** — Go HTTP proxy ("This is a proxy server")
- **Port 8888** — Hoverfly Dashboard

---

## 02 — FTP Anonymous Login & JAR Analysis

Downloaded `employee-service.jar` from the FTP server.

![](https://velog.velcdn.com/images/wearetheone/post/654b75e6-4514-4127-9a4b-df8081632fee/image.png)


![](https://velog.velcdn.com/images/wearetheone/post/471f2ba7-d144-49a0-b93c-e876e68c17e8/image.png)


Extracted `employee-service.jar`.

![](https://velog.velcdn.com/images/wearetheone/post/1fa6f4f9-dc6c-40c5-bbcd-969611ddea7f/image.png)


Installed the CFR decompiler to convert `.class` files to `.java`.

![](https://velog.velcdn.com/images/wearetheone/post/77654919-9265-4417-a03b-3eeeb04c83d9/image.png)


Decompilation.

![](https://velog.velcdn.com/images/wearetheone/post/84c0dbfb-59f6-4d36-ad38-0bc8ea1afbb4/image.png)


Inspected the resulting `.java` files (`ServerStarter`, `EmployeeService`, `EmployeeServiceImpl`, `Report`).

![](https://velog.velcdn.com/images/wearetheone/post/4a9386d4-3e8f-40fd-b012-898280beb7eb/image.png)


![](https://velog.velcdn.com/images/wearetheone/post/29eb7a97-d2de-440a-9c75-cda0fd08ea09/image.png)


![](https://velog.velcdn.com/images/wearetheone/post/7b033046-2f21-40b7-968a-8658aa506af8/image.png)


![](https://velog.velcdn.com/images/wearetheone/post/7c07092b-b221-480d-9ce3-2e50c459e843/image.png)



### What the source tells us

- **Endpoint:** http://0.0.0.0:8080/employeeservice
- **Behavior:** calls the `submitReport(Report)` method
- **Issue:** the server implementation echoes `report.getContent()` back into the response unchanged
- **Report object:** has a `content` field — this is our injection point

---

## 03 — XOP/MTOM SSRF via CVE-2022-46364

Verified that WSDL requests work.

![](https://velog.velcdn.com/images/wearetheone/post/d62c734d-f108-4900-bbec-60ce17a08722/image.png)


Inspected SOAP request/response.

![](https://velog.velcdn.com/images/wearetheone/post/25c24b9b-f9da-4c3b-90ca-f1316423326d/image.png)


Confirmed SSRF by requesting `/etc/passwd` and reading the response.

![](https://velog.velcdn.com/images/wearetheone/post/c612e3cd-14fa-421f-b830-1ddc260b869b/image.png)


Found a base64-encoded string inside the `Content` field.

![](https://velog.velcdn.com/images/wearetheone/post/fc96d22b-8a74-413c-8242-e3e78a23eaba/image.png)


After base64-decoding, plaintext `/etc/passwd` confirmed.

![](https://velog.velcdn.com/images/wearetheone/post/33b791ae-1009-4ad2-af19-1f810e7cc32e/image.png)


Used the SSRF to fetch the Hoverfly systemd unit file and recover the admin account and password.

![](https://velog.velcdn.com/images/wearetheone/post/52d0d52c-6193-4ec8-ba43-4dc8f8894dd9/image.png)


![](https://velog.velcdn.com/images/wearetheone/post/e0eb8bc6-1325-4adb-9b83-3940bcbfc0ee/image.png)


---

## 04 — Hoverfly Authentication

Installed `jq` for working with JSON on the CLI.

![](https://velog.velcdn.com/images/wearetheone/post/bbd47c22-7d2f-4e28-abdc-20f0f8b74425/image.png)


Obtained a Hoverfly JWT.

![](https://velog.velcdn.com/images/wearetheone/post/ceef7ad5-bcc4-4d82-bb1d-f8460a11a824/image.png)

Verified the token's privileges.

![](https://velog.velcdn.com/images/wearetheone/post/8179fba5-0290-459e-9e4c-c2b72c4b6cf2/image.png)



Made an authorized request with the JWT — the response confirms Hoverfly version 1.11.3.

This version is vulnerable to the Hoverfly Middleware RCE (CVE-2025-54123).

![](https://velog.velcdn.com/images/wearetheone/post/26020813-f7d6-4488-ad7f-a6243609ddbc/image.png)



---

## 05 — Hoverfly Middleware RCE (CVE-2025-54123)

Checked the `tun0` interface for the reverse shell.

![](https://velog.velcdn.com/images/wearetheone/post/213d25dc-cad7-425f-8298-93b8878e0965/image.png)



Crafted the payload and prepared the reverse shell on port 4444.

![](https://velog.velcdn.com/images/wearetheone/post/07d5af55-8ccc-4947-88c4-70aaefe8b032/image.png)


Listening on port 4444.

![](https://velog.velcdn.com/images/wearetheone/post/3e423258-8e3f-43a9-8c93-16af29971a3f/image.png)


Triggered the payload via the `source` command.

![](https://velog.velcdn.com/images/wearetheone/post/b5ce12f8-4fac-4614-b76d-e5681797de47/image.png)




---

## 06 — User Flag

Reverse shell connected — user flag captured.

![](https://velog.velcdn.com/images/wearetheone/post/2a01e903-ba93-4559-b3d2-5a4f51822e9f/image.png)

---

## 07 — Privilege Escalation Enumeration

Enumerating sudo privileges shows that `dev_ryan` can run `/opt/syswatch/syswatch.sh` as root without a password.

**Blacklist (forbidden arguments)**

- `web-stop`
- `web-restart`

All other arguments are allowed.

![](https://velog.velcdn.com/images/wearetheone/post/e1f480ef-7f99-4186-9159-17b70881efac/image.png)


The shell binary `/bin/bash` is set to mode 777 — anyone can modify it.

![](https://velog.velcdn.com/images/wearetheone/post/1712fbee-429d-4693-9889-47dd7fef6b18/image.png)


---

## 08 — Bash Binary Swap to Root

**Strategy:** when `sudo /opt/syswatch/syswatch.sh` runs, the script internally invokes **bash with root privileges**.

If we replace `/bin/bash` with **a malicious payload that creates a SUID copy of the original bash**, sudo will execute that payload as root for us.

SUID = a file that **executes with root privileges** when run.

### Recap

1. `/bin/bash` is world-writable
2. We replace `/bin/bash` with our malicious binary
3. `sudo /opt/syswatch/syswatch.sh` is executed
4. The script invokes bash internally
5. Our planted code runs **with root privileges**
6. A SUID bash is created
7. Root shell available on demand from then on

Backed up the original bash.

![](https://velog.velcdn.com/images/wearetheone/post/d12ad677-3c8a-40ef-aaaa-e4cb5c9e261e/image.png)


Created the malicious bash payload.

![](https://velog.velcdn.com/images/wearetheone/post/01d6d7b3-1b13-4892-a087-4eff3890d2e6/image.png)


Switched to dash so we can modify bash.

If the prompt becomes `$`, the dash switch was successful.

![](https://velog.velcdn.com/images/wearetheone/post/fce662d3-4148-4c49-b12e-c50ddfb5bce7/image.png)


Listed processes currently held by bash.

![](https://velog.velcdn.com/images/wearetheone/post/01a1fd35-c5cc-4686-a054-1761e85a6d17/image.png)


Killed the existing bash chain processes.

![](https://velog.velcdn.com/images/wearetheone/post/e94a49b9-c57f-4c95-9b13-50175ed97ba8/image.png)


From a separate terminal, attached a reverse shell on port 5555.

In the 5555 shell, switched to dash and prepared the swap to our malicious bash payload.

`16298` is the previous bash chain, `17201` is the new bash chain.

![](https://velog.velcdn.com/images/wearetheone/post/243ffaae-d533-4da9-9131-67879c16d7a9/image.png)

Killed the remaining bash chain processes and overwrote the binary with the malicious payload.

![](https://velog.velcdn.com/images/wearetheone/post/147f2d2a-aaf5-4c0c-a2eb-2dbea68934cd/image.png)



After the parent process exited, the `nohup`-launched malicious payload executed — the 66-byte bash process is now running with root privileges.

![](https://velog.velcdn.com/images/wearetheone/post/c84193e8-9fdf-4ef8-90b4-ca91b9422cf2/image.png)


Ran `syswatch.sh` with root privileges.

![](https://velog.velcdn.com/images/wearetheone/post/f2e54502-7d78-452a-9fef-380baa02ac82/image.png)


The original 4444 shell escalated to root — root flag captured.

![](https://velog.velcdn.com/images/wearetheone/post/22db136b-b153-4e39-a271-107531edc961/image.png)