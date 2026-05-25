---
layout: post
title: "Hack The Box — Interpreter Writeup"
description: "Difficulty: Medium"
date: 2026-05-18
lang: en
permalink: /en/posts/htb-interpreter/
category: htb
tags: [HackTheBox, Linux, SUID, Privilege Escalation]
---

# Interpreter

>[https://app.hackthebox.com/machines/Interpreter](https://app.hackthebox.com/machines/Interpreter)

**Machine:** Interpreter<br>
**Difficulty:** Medium<br>
**OS:** Linux

---

## Table of Contents

- 01 — Reconnaissance
- 02 — Mirth Connect Version Identification
- 03 — CVE-2023-43208 Unauthenticated RCE
- 04 — Reverse Shell as mirth user
- 05 — Database Credential Discovery
- 06 — PBKDF2 Hash Extraction & Cracking
- 07 — User Flag (SSH as sedric)
- 08 — Privilege Escalation Enumeration
- 09 — Flask eval() Injection to Root

---


# 01 — Reconnaissance

Scan across all ports.

The scan results show a Mirth Connect Administrator landing page on port 80.

![](/assets/posts/htb-interpreter/01.png)

For convenience, map the assigned IP (10.129.244.284) to the domain name (interpreter.htb).

![](/assets/posts/htb-interpreter/02.png)

Accessing http://interpreter.htb redirects to the Mirth Connect Administrator landing page (http://interpreter.htb/webadmin/Index.action).

![](/assets/posts/htb-interpreter/03.png)

Click "Launch Mirth Connect Administrator" to download webstart.jnlp (XML/Java Web Start launcher).

![](/assets/posts/htb-interpreter/04-1.png)

# 02 — Mirth Connect Version Identification

Inspecting the webstart.jnlp file reveals Mirth Connect Administrator version 4.4.0.
This version is vulnerable to <b>CVE-2023-43208</b> — an unauthenticated RCE.

![](/assets/posts/htb-interpreter/05.png)

# 03 — CVE-2023-43208 Unauthenticated RCE

Locate a public PoC for the CVE online.

![](/assets/posts/htb-interpreter/06.png)

Download the PoC.

![](/assets/posts/htb-interpreter/07.png)

Running the PoC confirms that the Mirth Connect instance on the target is vulnerable.

![](/assets/posts/htb-interpreter/08.png)

# 04 — Reverse Shell as mirth user

Start a reverse shell listener on Kali, port 4444.

![](/assets/posts/htb-interpreter/09.png)

Execute the PoC.

![](/assets/posts/htb-interpreter/10.png)

Reverse shell obtained.

![](/assets/posts/htb-interpreter/12.png)

# 05 — Database Credential Discovery

Check Mirth's credentials.

![](/assets/posts/htb-interpreter/13.png)

The database type, URL, username, and password are stored in plaintext.

![](/assets/posts/htb-interpreter/14.png)


Access the database from inside the reverse shell.

![](/assets/posts/htb-interpreter/15.png)

Enumerate user credentials inside the database.

The results show user `sedric` with an encrypted password.

![](/assets/posts/htb-interpreter/16.png)


# 06 — PBKDF2 Hash Extraction & Cracking


Base64-decode the password and output it as a single hex string.<br>
The output is 80 hex characters.<br>
80 hex chars = 40 bytes = 8-byte salt + 32-byte hash → inferred<br>
Salt: bbff8b0413949da7<br>
Hash: 62c8506c30ea080cf2db511d2b939f641243d4d7b8ad76b55603f90b32ddf0fb<br>
(SHA-256 output is 32 bytes, so the leading 8 bytes are the salt.)<br>

![](/assets/posts/htb-interpreter/17.png)

Base64-encoded salt:

![](/assets/posts/htb-interpreter/18.png)

Base64-encoded hash:

![](/assets/posts/htb-interpreter/19.png)

Hashcat mode 10900 (PBKDF2-HMAC-SHA256) format:<br>
sha256:&lt;iterations&gt;:&lt;base64_salt&gt;:&lt;base64_hash&gt;<br>
The iteration count of 600000 is the standard PBKDF2 setting used by recent versions of Mirth Connect.<br>

Save the value in the format above for hash cracking.<br>

![](/assets/posts/htb-interpreter/20.png)

Run hash cracking with the prepared rockyou.txt wordlist.

![](/assets/posts/htb-interpreter/21.png)
![](/assets/posts/htb-interpreter/22.png)

Hash cracking reveals that user `sedric`'s password is `snowflake1`.

![](/assets/posts/htb-interpreter/23.png)

# 07 — User Flag (SSH as sedric)

SSH in with the recovered password and grab the user flag.

![](/assets/posts/htb-interpreter/24.png)

# 08 — Privilege Escalation Enumeration

Identify a Python program running as root.

![](/assets/posts/htb-interpreter/25.png)

Read `notif.py`, which is running as root.<br>
`notif.py` is a notification server that receives and responds to XML requests.<br>

![](/assets/posts/htb-interpreter/26.png)


# 09 — Flask eval() Injection to Root

1.	The regex explicitly allows `{`, `}`, `'`, `"`, `(`, `)`, `=`, `+`, `/`, `.`, and so on —
in other words, every character needed to construct a Python expression is permitted.
2.	The template is built as a Python f-string and then executed via `eval()`.
Inside an f-string, the contents of `{...}` are evaluated as Python code at runtime.
3.	`firstname` (along with the other fields) is interpolated directly into that f-string, and because the regex allows `{}`, a Python expression can be injected and executed with root privileges.

![](/assets/posts/htb-interpreter/27.png)

Send a well-formed XML request to confirm `notify.py`'s response.

![](/assets/posts/htb-interpreter/28.png)

Inject the payload into `firstname`.<br>
Wrapping the Python expression in `{...}` causes the f-string evaluator to execute the code at runtime.<br>
Root flag obtained.<br>

![](/assets/posts/htb-interpreter/29.png)

From a regex perspective, checking whether `{open("/root/root.txt").read()}` passes:
- letters
- `.`
- `/`
- `"`
- `(`
- `)`
- `{`
- `}`

are all included in the allowed character set.
And:
- no whitespace
- no other forbidden special characters

Therefore, it passes the regex.