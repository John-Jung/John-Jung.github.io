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

![](https://velog.velcdn.com/images/wearetheone/post/2ce9b967-8589-4712-b9f5-1b43030f24da/image.png)


서비스 버전 탐지

![](https://velog.velcdn.com/images/wearetheone/post/31be662e-1b69-4c8e-9c5e-3e70be602dad/image.png)


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

![](https://velog.velcdn.com/images/wearetheone/post/654b75e6-4514-4127-9a4b-df8081632fee/image.png)


![](https://velog.velcdn.com/images/wearetheone/post/471f2ba7-d144-49a0-b93c-e876e68c17e8/image.png)


employee-service.jar 압축해제

![](https://velog.velcdn.com/images/wearetheone/post/1fa6f4f9-dc6c-40c5-bbcd-969611ddea7f/image.png)


.class -> .java 파일로 디컴파일을 위한 CFR 디컴파일러 설치

![](https://velog.velcdn.com/images/wearetheone/post/77654919-9265-4417-a03b-3eeeb04c83d9/image.png)


디컴파일

![](https://velog.velcdn.com/images/wearetheone/post/84c0dbfb-59f6-4d36-ad38-0bc8ea1afbb4/image.png)


.java 파일 확인 (ServerStarter, EmployeeService, EmployeeServiceImpl, Report)

![](https://velog.velcdn.com/images/wearetheone/post/4a9386d4-3e8f-40fd-b012-898280beb7eb/image.png)


![](https://velog.velcdn.com/images/wearetheone/post/29eb7a97-d2de-440a-9c75-cda0fd08ea09/image.png)


![](https://velog.velcdn.com/images/wearetheone/post/7b033046-2f21-40b7-968a-8658aa506af8/image.png)


![](https://velog.velcdn.com/images/wearetheone/post/7c07092b-b221-480d-9ce3-2e50c459e843/image.png)



### 소스코드로 알 수 있는 것들

- **엔드포인트:** http://0.0.0.0:8080/employeeservice
- **동작:** submitReport(Report) 함수 호출
- **문제점:** 서버 구현에서 report.getContent() 값을 그대로 응답에 다시 포함시킴
- **Report 객체:** content 필드를 가지고 있으며, 이 부분이 우리가 입력을 주입할 수 있는 지점 (injection point)

---

## 03 — XOP/MTOM SSRF via CVE-2022-46364

WSDL 요청이 동작하는지 확인

![](https://velog.velcdn.com/images/wearetheone/post/d62c734d-f108-4900-bbec-60ce17a08722/image.png)


SOAP 요청/응답을 확인

![](https://velog.velcdn.com/images/wearetheone/post/25c24b9b-f9da-4c3b-90ca-f1316423326d/image.png)


SSRF 확인하여 etc/passwd 요청/응답을 확인

![](https://velog.velcdn.com/images/wearetheone/post/c612e3cd-14fa-421f-b830-1ddc260b869b/image.png)


Content안에 base64로 인코딩된 스트링을 확인

![](https://velog.velcdn.com/images/wearetheone/post/fc96d22b-8a74-413c-8242-e3e78a23eaba/image.png)


base64 디코딩 이후 etc/passwd 평문 확인

![](https://velog.velcdn.com/images/wearetheone/post/33b791ae-1009-4ad2-af19-1f810e7cc32e/image.png)


SSRF로 Hoverfly systemd unit 가져와서 admin 계정과 비밀번호 확인

![](https://velog.velcdn.com/images/wearetheone/post/52d0d52c-6193-4ec8-ba43-4dc8f8894dd9/image.png)


![](https://velog.velcdn.com/images/wearetheone/post/e0eb8bc6-1325-4adb-9b83-3940bcbfc0ee/image.png)


---

## 04 — Hoverfly Authentication

CLI로 json 요청을 위해 jq 다운로드

![](https://velog.velcdn.com/images/wearetheone/post/bbd47c22-7d2f-4e28-abdc-20f0f8b74425/image.png)


Hoverfly JWT 획득

![](https://velog.velcdn.com/images/wearetheone/post/ceef7ad5-bcc4-4d82-bb1d-f8460a11a824/image.png)

획득한 토큰 권한 확인
![](https://velog.velcdn.com/images/wearetheone/post/8179fba5-0290-459e-9e4c-c2b72c4b6cf2/image.png)



획득한 JWT로 인가 요청 -> 응답에서 Hoverfly 버전 1.11.3을 확인

해당 버전은 Hoverfly Middleware RCE(CVE-2025-54123) 가 가능

![](https://velog.velcdn.com/images/wearetheone/post/26020813-f7d6-4488-ad7f-a6243609ddbc/image.png)



---

## 05 — Hoverfly Middleware RCE (CVE-2025-54123)

리버스쉘을 위해 tun0를 확인

![](https://velog.velcdn.com/images/wearetheone/post/213d25dc-cad7-425f-8298-93b8878e0965/image.png)



페이로드 제작 / 4444포트로 리버스쉘 attach

![](https://velog.velcdn.com/images/wearetheone/post/07d5af55-8ccc-4947-88c4-70aaefe8b032/image.png)


4444포트 listening

![](https://velog.velcdn.com/images/wearetheone/post/3e423258-8e3f-43a9-8c93-16af29971a3f/image.png)


source 명령어로 페이로드 실행

![](https://velog.velcdn.com/images/wearetheone/post/b5ce12f8-4fac-4614-b76d-e5681797de47/image.png)




---

## 06 — User Flag

리버스쉘 attach 및 사용자 플래그 획득

![](https://velog.velcdn.com/images/wearetheone/post/2a01e903-ba93-4559-b3d2-5a4f51822e9f/image.png)

---

## 07 — Privilege Escalation Enumeration

루트 접근 권한 확인결과 현재 dev_ryan은 비밀번호 없이 /opt/syswatch/syswatch.sh을 root권한으로 실행가능

**블랙리스트(금지조건)**

- web-stop
- web-restart

그 외 인자들 전부 허용

![](https://velog.velcdn.com/images/wearetheone/post/e1f480ef-7f99-4186-9159-17b70881efac/image.png)


쉘 실행파일 /bin/bash의 권한 확인 결과 777로 설정되어 있어 누구나 쉘 파일을 수정 가능

![](https://velog.velcdn.com/images/wearetheone/post/1712fbee-429d-4693-9889-47dd7fef6b18/image.png)


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

![](https://velog.velcdn.com/images/wearetheone/post/d12ad677-3c8a-40ef-aaaa-e4cb5c9e261e/image.png)


악의적인 bash 페이로드 생성

![](https://velog.velcdn.com/images/wearetheone/post/01d6d7b3-1b13-4892-a087-4eff3890d2e6/image.png)


bash를 수정하기 위해 dash로 전환

$로 나온다면 dash 전환 성공

![](https://velog.velcdn.com/images/wearetheone/post/fce662d3-4148-4c49-b12e-c50ddfb5bce7/image.png)


현재 bash에서 점유중인 프로세스 확인

![](https://velog.velcdn.com/images/wearetheone/post/01a1fd35-c5cc-4686-a054-1761e85a6d17/image.png)


이전 bash chain들은 프로세스 종료(kill)

![](https://velog.velcdn.com/images/wearetheone/post/e94a49b9-c57f-4c95-9b13-50175ed97ba8/image.png)


다른 터미널, 5555포트로 리버스쉘 attach

5555쉘에서 dash로 전환 후 우리가 준비한 bash 악성 코드 변환 준비

16298은 이전 bash chain, 17201은 새로운 bash chain

![](https://velog.velcdn.com/images/wearetheone/post/243ffaae-d533-4da9-9131-67879c16d7a9/image.png)

남아 있는 bash chain 프로세스 종료 및 악성 페이로드로 덮어쓰기

![](https://velog.velcdn.com/images/wearetheone/post/147f2d2a-aaf5-4c0c-a2eb-2dbea68934cd/image.png)



위에서 nohup으로 실행한 악성 페이로드 부모 프로세스 종료 후 실행되어 66바이트 bash 프로세스가 루트 권한으로 실행되는 것을 확인

![](https://velog.velcdn.com/images/wearetheone/post/c84193e8-9fdf-4ef8-90b4-ca91b9422cf2/image.png)


syswatch.sh를 루트 권한으로 실행

![](https://velog.velcdn.com/images/wearetheone/post/f2e54502-7d78-452a-9fef-380baa02ac82/image.png)


기존 4444쉘이 루트 권한으로 상승하여 root flag를 접근

![](https://velog.velcdn.com/images/wearetheone/post/22db136b-b153-4e39-a271-107531edc961/image.png)

