---
layout: post
title: "Hack The Box — Interpreter Writeup"
description: "난이도: Medium"
date: 2026-05-18
lang: ko
permalink: /ko/posts/htb-interpreter/
category: htb
tags: [HackTheBox, Linux, SUID, Privilege Escalation]
---

# Interpreter

>[https://app.hackthebox.com/machines/Interpreter](https://app.hackthebox.com/machines/Interpreter)

**문제:** Interpreter<br>
**난이도:** Medium<br>
**OS:** Linux

---

## 목차

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

모든 포트에 대하여 스캔

스캔 결과 80포트에서 Mirth Connect Administrator landing page를 확인

![](/assets/posts/htb-interpreter/01.png)

편의를 위해 부여받은 IP(10.129.244.284) 도메인 네임(interpreter.htb) 설정

![](/assets/posts/htb-interpreter/02.png)

http://interpreter.htb로 접근하면 Mirth Connect Administrator landing page(http://interpreter.htb/webadmin/Index.action)로 리다이렉트 되는 것을 확인

![](/assets/posts/htb-interpreter/03.png)

Launch Mirth Connect Administrator를 클릭하여 webstart.jnlp(XML/Java Web Start launcher)을 다운로드

![](/assets/posts/htb-interpreter/04-1.png)

# 02 — Mirth Connect Version Identification

webstart.jnlp 파일 확인 결과 Mirth Connect Administrator 4.4.0 버전 결과를 식별
해당 버전은 <b>CVE-2023-43208</b> — unauthenticated RCE에 취약함.

![](/assets/posts/htb-interpreter/05.png)

# 03 — CVE-2023-43208 Unauthenticated RCE

해당 CVE의 poc를 인터넷에서 식별

![](/assets/posts/htb-interpreter/06.png)

poc 다운로드

![](/assets/posts/htb-interpreter/07.png)

poc코드로 해당 부여받은 IP에서 사용하는 Mirth Connect는 취약한 것으로 판별

![](/assets/posts/htb-interpreter/08.png)

# 04 — Reverse Shell as mirth user

kali 4444포트에서 리버스쉘 리스닝

![](/assets/posts/htb-interpreter/09.png)

poc 코드 실행

![](/assets/posts/htb-interpreter/10.png)

리버스쉘 획득

![](/assets/posts/htb-interpreter/12.png)

# 05 — Database Credential Discovery

mirth의 credential 확인

![](/assets/posts/htb-interpreter/13.png)

확인 결과 데이터베이스 종류/URL/username/비밀번호를 평문으로 확인

![](/assets/posts/htb-interpreter/14.png)


리버스쉘 안에서 데이터베이스에 접근

![](/assets/posts/htb-interpreter/15.png)

데이터베이스 안에서 사용자 credential 확인

확인 결과 유저 `sedric`와 암호화된 비밀번호 확인

![](/assets/posts/htb-interpreter/16.png)


# 06 — PBKDF2 Hash Extraction & Cracking


비밀번호 base64 디코딩 및 단일 hex값으로 출력<br>
출력 결과 80 hex chars로 확인<br>
80 hex chars = 40 bytes = 8 bytes 솔트값 + 32 bytes 해시값 -> 추측<br>
솔트값: bbff8b0413949da7<br>
해시값: 62c8506c30ea080cf2db511d2b939f641243d4d7b8ad76b55603f90b32ddf0fb<br>
(SHA-256의 결과는 32 bytes이므로 앞에 8 bytes가 솔트값)<br>

![](/assets/posts/htb-interpreter/17.png)

솔트값의 base64 인코딩값

![](/assets/posts/htb-interpreter/18.png)

해시값의 base64 인코딩값

![](/assets/posts/htb-interpreter/19.png)

Hashcat mode 10900(PBKDF2-HMAC-SHA256)의 형식<br>
sha256:<\iterations>:<\base64_salt>:<\base64_hash><br>
여기서 iteration count(반복 횟수)인 600000 은 최신 Mirth Connect 에서 사용하는 표준 PBKDF2 설정이다.<br>

hash cracking을 위에 형식을 저장한다.<br>

![](/assets/posts/htb-interpreter/20.png)

준비된 rockyou.txt를 가지고 hash cracking을 진행한다.

![](/assets/posts/htb-interpreter/21.png)
![](/assets/posts/htb-interpreter/22.png)

hash cracking 결과 `sedric` 유저의 비밀번호는 `snowflake1` 인것을 확인한다.

![](/assets/posts/htb-interpreter/23.png)

# 07 — User Flag (SSH as sedric)

해당 비밀번호로 가지고 ssh로 접근하여 user flag를 획득한다.

![](/assets/posts/htb-interpreter/24.png)

# 08 — Privilege Escalation Enumeration

root 권한으로 실행되고 있는 파이썬 프로그램을 확인

![](/assets/posts/htb-interpreter/25.png)

root 권한으로 실행 중인 `notif.py` 읽기<br>
`notif.py` Notification 서버로서 XML 요청을 받고 응답하는 서버<br>

![](/assets/posts/htb-interpreter/26.png)


# 09 — Flask eval() Injection to Root

1.	정규식이 `{`, `}`, `'`, `"`, `(`, `)`, `=`, `+`, `/`, `.`, 등을 명시적으로 허용
즉, Python 표현식을 구성하는 데 필요한 요소들이 모두 허용
2.	template 는 Python f-string 형태로 만들어진 뒤 `eval()` 로 실행
f-string 내부에서는 `{...}` 안의 내용이 런타임에 Python 코드로 평가
3.	`firstname`(및 다른 필드들)이 해당 f-string 안에 직접 삽입되며, 정규식이 `{}` 를 허용하기 때문에, Python 표현식을 삽입할 수 있고 그것이 root 권한으로 실행 가능

![](/assets/posts/htb-interpreter/27.png)

정상적인 XML 요청을 보내어 `notify.py` 응답을 확인 

![](/assets/posts/htb-interpreter/28.png)

payload를 `firstname`에 삽입<br>
Python 표현식을 `{...}` 로 감싸서, f-string evaluator가 런타임에 해당 코드를 실행<br>
root flag 획득<br>

![](/assets/posts/htb-interpreter/29.png)

정규식 관점에서 `{open("/root/root.txt").read()}` 가 통과하는지 확인해보면:
- 문자(letters) 
- `.` 
- `/` 
- `"` 
- `(` 
- `)` 
- `{` 
- `}` 
모두 허용된 문자 집합에 포함
그리고:
- 공백 없음 
- 기타 금지된 특수문자 없음 

따라서 정규식을 통과
