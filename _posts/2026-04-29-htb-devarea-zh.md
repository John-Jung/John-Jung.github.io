---
layout: post
title: "Hack The Box — DevArea Writeup"
description: "难度：Medium"
date: 2026-04-29
lang: zh
permalink: /zh/posts/htb-devarea/
category: htb
tags: [HackTheBox, Linux, SUID, Privilege Escalation]
---

# DevArea

>[https://app.hackthebox.com/machines/DevArea](https://app.hackthebox.com/machines/DevArea)

**Machine:** DevArea<br>
**Difficulty:** Medium<br>
**OS:** Linux

---

## 目录

- 01 — 信息收集
- 02 — FTP 匿名登录与 JAR 分析
- 03 — 通过 CVE-2022-46364 实现 XOP/MTOM SSRF
- 04 — Hoverfly 身份认证
- 05 — Hoverfly Middleware RCE (CVE-2025-54123)
- 06 — User Flag
- 07 — 权限提升枚举
- 08 — 替换 Bash 二进制以获取 root

---

## 01 — 信息收集

对全端口进行扫描。

![](https://velog.velcdn.com/images/wearetheone/post/2ce9b967-8589-4712-b9f5-1b43030f24da/image.png)


服务版本探测。

![](https://velog.velcdn.com/images/wearetheone/post/31be662e-1b69-4c8e-9c5e-3e70be602dad/image.png)


### 信息收集结果

- **端口 21** — vsftpd 3.0.5（允许匿名登录，pub/ 目录可访问）
- **端口 22** — OpenSSH 9.6p1
- **端口 80** — Apache 2.4.58（重定向到 devarea.htb）
- **端口 8080** — Jetty 9.4.27（疑似 Apache CXF）
- **端口 8500** — Go HTTP 代理（"This is a proxy server"）
- **端口 8888** — Hoverfly Dashboard

---

## 02 — FTP 匿名登录与 JAR 分析

从 FTP 服务器下载 `employee-service.jar` 文件。

![](https://velog.velcdn.com/images/wearetheone/post/654b75e6-4514-4127-9a4b-df8081632fee/image.png)


![](https://velog.velcdn.com/images/wearetheone/post/471f2ba7-d144-49a0-b93c-e876e68c17e8/image.png)


解压 `employee-service.jar`。

![](https://velog.velcdn.com/images/wearetheone/post/1fa6f4f9-dc6c-40c5-bbcd-969611ddea7f/image.png)


安装 CFR 反编译器，将 `.class` 文件转换为 `.java` 文件。

![](https://velog.velcdn.com/images/wearetheone/post/77654919-9265-4417-a03b-3eeeb04c83d9/image.png)


执行反编译。

![](https://velog.velcdn.com/images/wearetheone/post/84c0dbfb-59f6-4d36-ad38-0bc8ea1afbb4/image.png)


查看反编译出的 `.java` 文件（`ServerStarter`、`EmployeeService`、`EmployeeServiceImpl`、`Report`）。

![](https://velog.velcdn.com/images/wearetheone/post/4a9386d4-3e8f-40fd-b012-898280beb7eb/image.png)


![](https://velog.velcdn.com/images/wearetheone/post/29eb7a97-d2de-440a-9c75-cda0fd08ea09/image.png)


![](https://velog.velcdn.com/images/wearetheone/post/7b033046-2f21-40b7-968a-8658aa506af8/image.png)


![](https://velog.velcdn.com/images/wearetheone/post/7c07092b-b221-480d-9ce3-2e50c459e843/image.png)



### 从源码可以得知的信息

- **接口：** http://0.0.0.0:8080/employeeservice
- **行为：** 调用 `submitReport(Report)` 函数
- **问题点：** 服务端实现将 `report.getContent()` 的值原样回显到响应中
- **Report 对象：** 包含 `content` 字段——这就是我们可以注入输入的位置（注入点）

---

## 03 — 通过 CVE-2022-46364 实现 XOP/MTOM SSRF

确认 WSDL 请求可以正常工作。

![](https://velog.velcdn.com/images/wearetheone/post/d62c734d-f108-4900-bbec-60ce17a08722/image.png)


查看 SOAP 请求/响应。

![](https://velog.velcdn.com/images/wearetheone/post/25c24b9b-f9da-4c3b-90ca-f1316423326d/image.png)


通过请求 `/etc/passwd` 验证 SSRF。

![](https://velog.velcdn.com/images/wearetheone/post/c612e3cd-14fa-421f-b830-1ddc260b869b/image.png)


在 `Content` 字段中发现 base64 编码字符串。

![](https://velog.velcdn.com/images/wearetheone/post/fc96d22b-8a74-413c-8242-e3e78a23eaba/image.png)


base64 解码后确认 `/etc/passwd` 明文内容。

![](https://velog.velcdn.com/images/wearetheone/post/33b791ae-1009-4ad2-af19-1f810e7cc32e/image.png)


利用 SSRF 获取 Hoverfly 的 systemd unit 文件，从中获取到 admin 账号和密码。

![](https://velog.velcdn.com/images/wearetheone/post/52d0d52c-6193-4ec8-ba43-4dc8f8894dd9/image.png)


![](https://velog.velcdn.com/images/wearetheone/post/e0eb8bc6-1325-4adb-9b83-3940bcbfc0ee/image.png)


---

## 04 — Hoverfly 身份认证

为了在 CLI 上处理 JSON 请求，安装 `jq`。

![](https://velog.velcdn.com/images/wearetheone/post/bbd47c22-7d2f-4e28-abdc-20f0f8b74425/image.png)


获取 Hoverfly JWT。

![](https://velog.velcdn.com/images/wearetheone/post/ceef7ad5-bcc4-4d82-bb1d-f8460a11a824/image.png)

确认获取到的 token 权限。

![](https://velog.velcdn.com/images/wearetheone/post/8179fba5-0290-459e-9e4c-c2b72c4b6cf2/image.png)



使用获取的 JWT 发起授权请求——响应中确认 Hoverfly 版本为 1.11.3。

该版本存在 Hoverfly Middleware RCE (CVE-2025-54123) 漏洞。

![](https://velog.velcdn.com/images/wearetheone/post/26020813-f7d6-4488-ad7f-a6243609ddbc/image.png)



---

## 05 — Hoverfly Middleware RCE (CVE-2025-54123)

为反向 shell 准备，确认 `tun0` 接口。

![](https://velog.velcdn.com/images/wearetheone/post/213d25dc-cad7-425f-8298-93b8878e0965/image.png)



构造 payload，并在 4444 端口准备反向 shell。

![](https://velog.velcdn.com/images/wearetheone/post/07d5af55-8ccc-4947-88c4-70aaefe8b032/image.png)


在 4444 端口监听。

![](https://velog.velcdn.com/images/wearetheone/post/3e423258-8e3f-43a9-8c93-16af29971a3f/image.png)


使用 `source` 命令触发 payload。

![](https://velog.velcdn.com/images/wearetheone/post/b5ce12f8-4fac-4614-b76d-e5681797de47/image.png)




---

## 06 — User Flag

反向 shell 成功连接，获取 user flag。

![](https://velog.velcdn.com/images/wearetheone/post/2a01e903-ba93-4559-b3d2-5a4f51822e9f/image.png)

---

## 07 — 权限提升枚举

枚举 sudo 权限发现，当前用户 `dev_ryan` 可以无密码以 root 权限执行 `/opt/syswatch/syswatch.sh`。

**黑名单（禁止参数）**

- `web-stop`
- `web-restart`

其他所有参数均允许。

![](https://velog.velcdn.com/images/wearetheone/post/e1f480ef-7f99-4186-9159-17b70881efac/image.png)


查看 shell 二进制文件 `/bin/bash` 的权限——发现被设置为 777，任何人都可以修改。

![](https://velog.velcdn.com/images/wearetheone/post/1712fbee-429d-4693-9889-47dd7fef6b18/image.png)


---

## 08 — 替换 Bash 二进制以获取 root

**思路：** 执行 `sudo /opt/syswatch/syswatch.sh` 时，该脚本内部会**以 root 权限运行 bash**。

如果我们把 `/bin/bash` **替换为"创建原始 bash 的 SUID 副本的恶意代码（payload）"**，sudo 就会以 root 权限替我们执行它。

SUID = 执行时**以 root 权限运行的文件**。

### 总结

1. `/bin/bash` 全局可写
2. 我们将 `/bin/bash` 替换为恶意代码
3. 执行 `sudo /opt/syswatch/syswatch.sh`
4. 脚本内部调用 bash
5. 我们植入的代码**以 root 权限执行**
6. 创建出 SUID bash
7. 之后可以随时获取 root shell

备份原始 bash。

![](https://velog.velcdn.com/images/wearetheone/post/d12ad677-3c8a-40ef-aaaa-e4cb5c9e261e/image.png)


生成恶意 bash payload。

![](https://velog.velcdn.com/images/wearetheone/post/01d6d7b3-1b13-4892-a087-4eff3890d2e6/image.png)


为修改 bash，切换到 dash。

如果提示符变为 `$`，说明已成功切换到 dash。

![](https://velog.velcdn.com/images/wearetheone/post/fce662d3-4148-4c49-b12e-c50ddfb5bce7/image.png)


查看当前 bash 占用的进程。

![](https://velog.velcdn.com/images/wearetheone/post/01a1fd35-c5cc-4686-a054-1761e85a6d17/image.png)


结束（kill）之前的 bash chain 进程。

![](https://velog.velcdn.com/images/wearetheone/post/e94a49b9-c57f-4c95-9b13-50175ed97ba8/image.png)


在另一个终端中，通过 5555 端口建立反向 shell。

在 5555 shell 中切换到 dash，准备替换为我们准备好的恶意 bash payload。

`16298` 是之前的 bash chain，`17201` 是新的 bash chain。

![](https://velog.velcdn.com/images/wearetheone/post/243ffaae-d533-4da9-9131-67879c16d7a9/image.png)

结束剩余的 bash chain 进程，并用恶意 payload 覆盖。

![](https://velog.velcdn.com/images/wearetheone/post/147f2d2a-aaf5-4c0c-a2eb-2dbea68934cd/image.png)



父进程结束后，前面用 `nohup` 启动的恶意 payload 开始运行——可以确认 66 字节的 bash 进程正在以 root 权限运行。

![](https://velog.velcdn.com/images/wearetheone/post/c84193e8-9fdf-4ef8-90b4-ca91b9422cf2/image.png)


以 root 权限执行 `syswatch.sh`。

![](https://velog.velcdn.com/images/wearetheone/post/f2e54502-7d78-452a-9fef-380baa02ac82/image.png)


原本的 4444 shell 提权为 root，成功访问 root flag。

![](https://velog.velcdn.com/images/wearetheone/post/22db136b-b153-4e39-a271-107531edc961/image.png)