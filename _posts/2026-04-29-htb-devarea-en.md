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

>[https://app.hackthebox.com/machines/DevArea](https://app.hackthebox.com/machines/DevArea)

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

![](/assets/posts/htb-devarea/01.png)


Service version detection.

![](/assets/posts/htb-devarea/02.png)


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

![](/assets/posts/htb-devarea/04.png)


![](/assets/posts/htb-devarea/04-1.png)


Extracted `employee-service.jar`.

![](/assets/posts/htb-devarea/05.png)

Installed the CFR decompiler to convert `.class` files to `.java`.

![](/assets/posts/htb-devarea/08.png)


Decompilation.

![](/assets/posts/htb-devarea/08-1.png)


Inspected the resulting `.java` files (`ServerStarter`, `EmployeeService`, `EmployeeServiceImpl`, `Report`).

![](/assets/posts/htb-devarea/08-2.png)


![](/assets/posts/htb-devarea/08-3.png)


![](/assets/posts/htb-devarea/08-4.png)

![](/assets/posts/htb-devarea/08-5.png)



### What the source tells us

- **Endpoint:** http://0.0.0.0:8080/employeeservice
- **Behavior:** calls the `submitReport(Report)` method
- **Issue:** the server implementation echoes `report.getContent()` back into the response unchanged
- **Report object:** has a `content` field — this is our injection point

---

## 03 — XOP/MTOM SSRF via CVE-2022-46364

Verified that WSDL requests work.

![](/assets/posts/htb-devarea/09.png)


Inspected SOAP request/response.

![](/assets/posts/htb-devarea/09-1.png)


Confirmed SSRF by requesting `/etc/passwd` and reading the response.

![](/assets/posts/htb-devarea/10.png)


Found a base64-encoded string inside the `Content` field.

![](/assets/posts/htb-devarea/10-1.png)


After base64-decoding, plaintext `/etc/passwd` confirmed.

![](/assets/posts/htb-devarea/11.png)

Used the SSRF to fetch the Hoverfly systemd unit file and recover the admin account and password.

![](/assets/posts/htb-devarea/12.png)


![](/assets/posts/htb-devarea/12-1.png)


---

## 04 — Hoverfly Authentication

Installed `jq` for working with JSON on the CLI.

![](/assets/posts/htb-devarea/13.png)


Obtained a Hoverfly JWT.

![](/assets/posts/htb-devarea/14.png)

Verified the token's privileges.

![](/assets/posts/htb-devarea/14-1.png)


Made an authorized request with the JWT — the response confirms Hoverfly version 1.11.3.

This version is vulnerable to the Hoverfly Middleware RCE (CVE-2025-54123).

![](/assets/posts/htb-devarea/15.png)



---

## 05 — Hoverfly Middleware RCE (CVE-2025-54123)

Checked the `tun0` interface for the reverse shell.

![](/assets/posts/htb-devarea/16.png)



Crafted the payload and prepared the reverse shell on port 4444.

![](/assets/posts/htb-devarea/18.png)


Listening on port 4444.

![](/assets/posts/htb-devarea/18-1.png)


Triggered the payload via the `source` command.

![](/assets/posts/htb-devarea/19.png)




---

## 06 — User Flag

Reverse shell connected — user flag captured.

![](/assets/posts/htb-devarea/20.png)

---

## 07 — Privilege Escalation Enumeration

Enumerating sudo privileges shows that `dev_ryan` can run `/opt/syswatch/syswatch.sh` as root without a password.

**Blacklist (forbidden arguments)**

- `web-stop`
- `web-restart`

All other arguments are allowed.

![](/assets/posts/htb-devarea/21.png)


The shell binary `/bin/bash` is set to mode 777 — anyone can modify it.

![](/assets/posts/htb-devarea/22.png)


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

![](/assets/posts/htb-devarea/22-1.png)

Created the malicious bash payload.

![](/assets/posts/htb-devarea/23.png)


Switched to dash so we can modify bash.

If the prompt becomes `$`, the dash switch was successful.

![](/assets/posts/htb-devarea/24.png)


Listed processes currently held by bash.

![](/assets/posts/htb-devarea/25.png)


Killed the existing bash chain processes.

![](/assets/posts/htb-devarea/26.png)


From a separate terminal, attached a reverse shell on port 5555.

In the 5555 shell, switched to dash and prepared the swap to our malicious bash payload.

`16298` is the previous bash chain, `17201` is the new bash chain.

![](/assets/posts/htb-devarea/27.png)

Killed the remaining bash chain processes and overwrote the binary with the malicious payload.

![](/assets/posts/htb-devarea/28.png)



After the parent process exited, the `nohup`-launched malicious payload executed — the 66-byte bash process is now running with root privileges.

![](/assets/posts/htb-devarea/29.png)


Ran `syswatch.sh` with root privileges.

![](/assets/posts/htb-devarea/30.png)

The original 4444 shell escalated to root — root flag captured.

![](/assets/posts/htb-devarea/31.png)