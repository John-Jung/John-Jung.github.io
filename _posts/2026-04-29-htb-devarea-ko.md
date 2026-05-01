---
layout: post
title: "Hack The Box — DevArea Writeup"
description: "난이도: Medium"
date: 2026-04-29
lang: ko
permalink: /ko/posts/htb-devarea/
category: htb
tags: [HackTheBox, Linux, SUID, Privilege Escalation]
---

# DevArea

>[https://app.hackthebox.com/machines/DevArea](https://app.hackthebox.com/machines/DevArea)

**문제:** DevArea<br>
**난이도:** Medium<br>
**OS:** Linux

---

## 목차

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

모든 포트에 대하여 스캔

![](/assets/posts/htb-devarea/01.png)


서비스 버전 탐지

![](/assets/posts/htb-devarea/02.png)


### Recon 결과

- **Port 21** — vsftpd 3.0.5 (anonymous login allowed, pub/ directory exposed)
- **Port 22** — OpenSSH 9.6p1
- **Port 80** — Apache 2.4.58 (redirects to devarea.htb)
- **Port 8080** — Jetty 9.4.27 (likely Apache CXF)
- **Port 8500** — Go HTTP proxy ("This is a proxy server")
- **Port 8888** — Hoverfly Dashboard

---

## 02 — FTP Anonymous Login & JAR Analysis

FTP 서버의 employee-service.jar 파일 다운로드

![](/assets/posts/htb-devarea/04.png)


![](/assets/posts/htb-devarea/04-1.png)


employee-service.jar 압축해제

![](/assets/posts/htb-devarea/05.png)


.class -> .java 파일로 디컴파일을 위한 CFR 디컴파일러 설치

![](/assets/posts/htb-devarea/08.png)


디컴파일

![](/assets/posts/htb-devarea/08-1.png)


.java 파일 확인 (ServerStarter, EmployeeService, EmployeeServiceImpl, Report)

![](/assets/posts/htb-devarea/08-2.png)


![](/assets/posts/htb-devarea/08-3.png)


![](/assets/posts/htb-devarea/08-4.png)


![](/assets/posts/htb-devarea/08-5.png)



### 소스코드로 알 수 있는 것들

- **엔드포인트:** http://0.0.0.0:8080/employeeservice
- **동작:** submitReport(Report) 함수 호출
- **문제점:** 서버 구현에서 report.getContent() 값을 그대로 응답에 다시 포함시킴
- **Report 객체:** content 필드를 가지고 있으며, 이 부분이 우리가 입력을 주입할 수 있는 지점 (injection point)

---

## 03 — XOP/MTOM SSRF via CVE-2022-46364

WSDL 요청이 동작하는지 확인

![](/assets/posts/htb-devarea/09.png)


SOAP 요청/응답을 확인

![](/assets/posts/htb-devarea/09-1.png)


SSRF 확인하여 etc/passwd 요청/응답을 확인

![](/assets/posts/htb-devarea/10.png)


Content안에 base64로 인코딩된 스트링을 확인

![](/assets/posts/htb-devarea/10-1.png)


base64 디코딩 이후 etc/passwd 평문 확인

![](/assets/posts/htb-devarea/11.png)


SSRF로 Hoverfly systemd unit 가져와서 admin 계정과 비밀번호 확인

![](/assets/posts/htb-devarea/12.png)


![](/assets/posts/htb-devarea/12-1.png)


---

## 04 — Hoverfly Authentication

CLI로 json 요청을 위해 jq 다운로드

![](/assets/posts/htb-devarea/13.png)


Hoverfly JWT 획득

![](/assets/posts/htb-devarea/14.png)

획득한 토큰 권한 확인

![](/assets/posts/htb-devarea/14-1.png)



획득한 JWT로 인가 요청 -> 응답에서 Hoverfly 버전 1.11.3을 확인

해당 버전은 Hoverfly Middleware RCE(CVE-2025-54123) 가 가능

![](/assets/posts/htb-devarea/15.png)



---

## 05 — Hoverfly Middleware RCE (CVE-2025-54123)

리버스쉘을 위해 tun0를 확인

![](/assets/posts/htb-devarea/16.png)



페이로드 제작 / 4444포트로 리버스쉘 attach

![](/assets/posts/htb-devarea/18.png)


4444포트 listening

![](/assets/posts/htb-devarea/18-1.png)


source 명령어로 페이로드 실행

![](/assets/posts/htb-devarea/19.png)




---

## 06 — User Flag

리버스쉘 attach 및 사용자 플래그 획득

![](/assets/posts/htb-devarea/20.png)

---

## 07 — Privilege Escalation Enumeration

루트 접근 권한 확인결과 현재 dev_ryan은 비밀번호 없이 /opt/syswatch/syswatch.sh을 root권한으로 실행가능

**블랙리스트(금지조건)**

- web-stop
- web-restart

그 외 인자들 전부 허용

![](/assets/posts/htb-devarea/21.png)


쉘 실행파일 /bin/bash의 권한 확인 결과 777로 설정되어 있어 누구나 쉘 파일을 수정 가능

![](/assets/posts/htb-devarea/22.png)


---

## 08 — Bash Binary Swap to Root

**전략:** sudo /opt/syswatch/syswatch.sh 명령을 실행하면 /opt/syswatch/syswatch.sh 스크립트가 내부적으로 **bash를 root 권한으로 실행한다.**

만약 우리가 /bin/bash를 **"원래 bash의 SUID 복사본을 만드는 악성 코드(payload)"로 바꿔치기**하면 sudo가 그걸 root 권한으로 실행해준다.

SUID = 실행 시 **root 권한으로 실행되는 파일**

### 정리

1. /bin/bash가 world-writable
2. 우리가 /bin/bash를 악성 코드로 변환
3. sudo /opt/syswatch/syswatch.sh 실행
4. 스크립트 내부에서 bash 실행됨
5. 우리가 심어둔 코드가 **root 권한으로 실행됨**
6. SUID bash 생성
7. 이후 언제든 root 쉘 획득

기존 bash 백업

![](/assets/posts/htb-devarea/22-1.png)


악의적인 bash 페이로드 생성

![](/assets/posts/htb-devarea/23.png)


bash를 수정하기 위해 dash로 전환

`$`로 나온다면 dash 전환 성공

![](/assets/posts/htb-devarea/24.png)


현재 bash에서 점유중인 프로세스 확인

![](/assets/posts/htb-devarea/25.png)


이전 bash chain들은 프로세스 종료(kill)

![](/assets/posts/htb-devarea/26.png)


다른 터미널, 5555포트로 리버스쉘 attach

5555쉘에서 dash로 전환 후 우리가 준비한 bash 악성 코드 변환 준비

16298은 이전 bash chain, 17201은 새로운 bash chain

![](/assets/posts/htb-devarea/27.png)

남아 있는 bash chain 프로세스 종료 및 악성 페이로드로 덮어쓰기

![](/assets/posts/htb-devarea/28.png)



위에서 nohup으로 실행한 악성 페이로드 부모 프로세스 종료 후 실행되어 66바이트 bash 프로세스가 루트 권한으로 실행되는 것을 확인

![](/assets/posts/htb-devarea/29.png)


syswatch.sh를 루트 권한으로 실행

![](/assets/posts/htb-devarea/30.png)


기존 4444쉘이 루트 권한으로 상승하여 root flag를 접근

![](/assets/posts/htb-devarea/31.png)

