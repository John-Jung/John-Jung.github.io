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

对全端口进行扫描。

![](/assets/posts/htb-devarea/01.png)


服务版本探测。

![](/assets/posts/htb-devarea/02.png)


### 信息收集结果

- **端口 21** — vsftpd 3.0.5（允许匿名登录，pub/ 目录可访问）
- **端口 22** — OpenSSH 9.6p1
- **端口 80** — Apache 2.4.58（重定向到 devarea.htb）
- **端口 8080** — Jetty 9.4.27（疑似 Apache CXF）
- **端口 8500** — Go HTTP 代理（"This is a proxy server"）
- **端口 8888** — Hoverfly Dashboard

---

## 02 — FTP Anonymous Login & JAR Analysis

从 FTP 服务器下载 `employee-service.jar` 文件。

![](/assets/posts/htb-devarea/04.png)

![](/assets/posts/htb-devarea/04-1.png)


解压 `employee-service.jar`。

![](/assets/posts/htb-devarea/05.png)


安装 CFR 反编译器，将 `.class` 文件转换为 `.java` 文件。

![](/assets/posts/htb-devarea/08.png)


执行反编译。

![](/assets/posts/htb-devarea/08-1.png)


查看反编译出的 `.java` 文件（`ServerStarter`、`EmployeeService`、`EmployeeServiceImpl`、`Report`）。

![](/assets/posts/htb-devarea/08-2.png)

![](/assets/posts/htb-devarea/08-3.png)


![](/assets/posts/htb-devarea/08-4.png)


![](/assets/posts/htb-devarea/08-5.png)



### 从源码可以得知的信息

- **接口：** http://0.0.0.0:8080/employeeservice
- **行为：** 调用 `submitReport(Report)` 函数
- **问题点：** 服务端实现将 `report.getContent()` 的值原样回显到响应中
- **Report 对象：** 包含 `content` 字段——这就是我们可以注入输入的位置（注入点）

---

## 03 — XOP/MTOM SSRF via CVE-2022-46364

确认 WSDL 请求可以正常工作。

![](/assets/posts/htb-devarea/09.png)


查看 SOAP 请求/响应。

![](/assets/posts/htb-devarea/09-1.png)


通过请求 `/etc/passwd` 验证 SSRF。

![](/assets/posts/htb-devarea/10.png)

在 `Content` 字段中发现 base64 编码字符串。

![](/assets/posts/htb-devarea/10-1.png)


base64 解码后确认 `/etc/passwd` 明文内容。

![](/assets/posts/htb-devarea/11.png)


利用 SSRF 获取 Hoverfly 的 systemd unit 文件，从中获取到 admin 账号和密码。

![](/assets/posts/htb-devarea/12.png)


![](/assets/posts/htb-devarea/12-1.png)

---

## 04 — Hoverfly Authentication

为了在 CLI 上处理 JSON 请求，安装 `jq`。

![](/assets/posts/htb-devarea/13.png)


获取 Hoverfly JWT。

![](/assets/posts/htb-devarea/14.png)

确认获取到的 token 权限。

![](/assets/posts/htb-devarea/14-1.png)



使用获取的 JWT 发起授权请求——响应中确认 Hoverfly 版本为 1.11.3。

该版本存在 Hoverfly Middleware RCE (CVE-2025-54123) 漏洞。

![](/assets/posts/htb-devarea/15.png)



---

## 05 — Hoverfly Middleware RCE (CVE-2025-54123)

为反向 shell 准备，确认 `tun0` 接口。

![](/assets/posts/htb-devarea/16.png)



构造 payload，并在 4444 端口准备反向 shell。

![](/assets/posts/htb-devarea/18.png)


在 4444 端口监听。

![](/assets/posts/htb-devarea/18-1.png)


使用 `source` 命令触发 payload。

![](/assets/posts/htb-devarea/19.png)




---

## 06 — User Flag

反向 shell 成功连接，获取 user flag。

![](/assets/posts/htb-devarea/20.png)

---

## 07 — Privilege Escalation Enumeration

枚举 sudo 权限发现，当前用户 `dev_ryan` 可以无密码以 root 权限执行 `/opt/syswatch/syswatch.sh`。

**黑名单（禁止参数）**

- `web-stop`
- `web-restart`

其他所有参数均允许。

![](/assets/posts/htb-devarea/21.png)


查看 shell 二进制文件 `/bin/bash` 的权限——发现被设置为 777，任何人都可以修改。

![](/assets/posts/htb-devarea/22.png)


---

## 08 — Bash Binary Swap to Root

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

![](/assets/posts/htb-devarea/22-1.png)


生成恶意 bash payload。

![](/assets/posts/htb-devarea/23.png)


为修改 bash，切换到 dash。

如果提示符变为 `$`，说明已成功切换到 dash。

![](/assets/posts/htb-devarea/24.png)


查看当前 bash 占用的进程。

![](/assets/posts/htb-devarea/25.png)


结束（kill）之前的 bash chain 进程。

![](/assets/posts/htb-devarea/26.png)

在另一个终端中，通过 5555 端口建立反向 shell。

在 5555 shell 中切换到 dash，准备替换为我们准备好的恶意 bash payload。

`16298` 是之前的 bash chain，`17201` 是新的 bash chain。

![](/assets/posts/htb-devarea/27.png)

结束剩余的 bash chain 进程，并用恶意 payload 覆盖。

![](/assets/posts/htb-devarea/28.png)



父进程结束后，前面用 `nohup` 启动的恶意 payload 开始运行——可以确认 66 字节的 bash 进程正在以 root 权限运行。

![](/assets/posts/htb-devarea/29.png)


以 root 权限执行 `syswatch.sh`。

![](/assets/posts/htb-devarea/30.png)


原本的 4444 shell 提权为 root，成功访问 root flag。

![](/assets/posts/htb-devarea/31.png)