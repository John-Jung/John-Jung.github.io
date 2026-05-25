---
layout: post
title: "Hack The Box — Interpreter 通关笔记"
description: "难度: Medium"
date: 2026-05-18
lang: zh
permalink: /zh/posts/htb-interpreter/
category: htb
tags: [HackTheBox, Linux, SUID, Privilege Escalation]
---

# Interpreter

>[https://app.hackthebox.com/machines/Interpreter](https://app.hackthebox.com/machines/Interpreter)

**靶机:** Interpreter<br>
**难度:** Medium<br>
**操作系统:** Linux

---

## 目录

- 01 — 信息收集
- 02 — Mirth Connect 版本识别
- 03 — CVE-2023-43208 未认证 RCE
- 04 — 以 mirth 用户获取反向 Shell
- 05 — 数据库凭据获取
- 06 — PBKDF2 哈希提取与破解
- 07 — User Flag(以 sedric 登录 SSH)
- 08 — 提权枚举
- 09 — Flask eval() 注入获取 Root

---


# 01 — 信息收集

对全端口进行扫描。

扫描结果显示 80 端口存在 Mirth Connect Administrator 登录页面。

![](/assets/posts/htb-interpreter/01.png)

为方便起见,将分配到的 IP(10.129.244.284)与域名(interpreter.htb)绑定。

![](/assets/posts/htb-interpreter/02.png)

访问 http://interpreter.htb 后,会被重定向到 Mirth Connect Administrator 登录页面(http://interpreter.htb/webadmin/Index.action)。

![](/assets/posts/htb-interpreter/03.png)

点击 "Launch Mirth Connect Administrator" 下载 webstart.jnlp(XML/Java Web Start 启动器)。

![](/assets/posts/htb-interpreter/04-1.png)

# 02 — Mirth Connect 版本识别

检查 webstart.jnlp 文件,识别出 Mirth Connect Administrator 4.4.0 版本。
该版本存在 <b>CVE-2023-43208</b> — 未认证 RCE 漏洞。

![](/assets/posts/htb-interpreter/05.png)

# 03 — CVE-2023-43208 未认证 RCE

在网上找到该 CVE 的 PoC。

![](/assets/posts/htb-interpreter/06.png)

下载 PoC。

![](/assets/posts/htb-interpreter/07.png)

使用 PoC 代码验证目标 IP 上运行的 Mirth Connect 确实存在漏洞。

![](/assets/posts/htb-interpreter/08.png)

# 04 — 以 mirth 用户获取反向 Shell

在 Kali 的 4444 端口监听反向 Shell。

![](/assets/posts/htb-interpreter/09.png)

执行 PoC 代码。

![](/assets/posts/htb-interpreter/10.png)

成功获得反向 Shell。

![](/assets/posts/htb-interpreter/12.png)

# 05 — 数据库凭据获取

查看 Mirth 的凭据。

![](/assets/posts/htb-interpreter/13.png)

发现数据库类型 / URL / 用户名 / 密码均以明文形式存储。

![](/assets/posts/htb-interpreter/14.png)


在反向 Shell 中访问数据库。

![](/assets/posts/htb-interpreter/15.png)

在数据库中枚举用户凭据。

发现用户 `sedric` 及其加密后的密码。

![](/assets/posts/htb-interpreter/16.png)


# 06 — PBKDF2 哈希提取与破解


对密码进行 base64 解码,并输出为单一的十六进制字符串。<br>
输出结果为 80 个十六进制字符。<br>
80 hex chars = 40 bytes = 8 字节盐值 + 32 字节哈希值 → 推断<br>
盐值: bbff8b0413949da7<br>
哈希值: 62c8506c30ea080cf2db511d2b939f641243d4d7b8ad76b55603f90b32ddf0fb<br>
(SHA-256 输出为 32 字节,因此前 8 字节为盐值。)<br>

![](/assets/posts/htb-interpreter/17.png)

盐值的 base64 编码:

![](/assets/posts/htb-interpreter/18.png)

哈希值的 base64 编码:

![](/assets/posts/htb-interpreter/19.png)

Hashcat mode 10900(PBKDF2-HMAC-SHA256)的格式:<br>
sha256:&lt;iterations&gt;:&lt;base64_salt&gt;:&lt;base64_hash&gt;<br>
其中迭代次数 600000 是最新版 Mirth Connect 使用的标准 PBKDF2 配置。<br>

按上述格式保存以便进行哈希破解。<br>

![](/assets/posts/htb-interpreter/20.png)

使用准备好的 rockyou.txt 字典进行哈希破解。

![](/assets/posts/htb-interpreter/21.png)
![](/assets/posts/htb-interpreter/22.png)

哈希破解结果显示 `sedric` 用户的密码为 `snowflake1`。

![](/assets/posts/htb-interpreter/23.png)

# 07 — User Flag(以 sedric 登录 SSH)

使用该密码通过 SSH 登录,获取 user flag。

![](/assets/posts/htb-interpreter/24.png)

# 08 — 提权枚举

识别以 root 权限运行的 Python 程序。

![](/assets/posts/htb-interpreter/25.png)

读取以 root 权限运行的 `notif.py`。<br>
`notif.py` 是一个 Notification 服务,负责接收并响应 XML 请求。<br>

![](/assets/posts/htb-interpreter/26.png)


# 09 — Flask eval() 注入获取 Root

1.	正则表达式明确允许 `{`、`}`、`'`、`"`、`(`、`)`、`=`、`+`、`/`、`.` 等字符。
也就是说,构造 Python 表达式所需的全部元素都在白名单内。
2.	template 以 Python f-string 形式构建,随后通过 `eval()` 执行。
而在 f-string 中,`{...}` 内的内容会在运行时作为 Python 代码被求值。
3.	`firstname`(及其他字段)被直接插入到该 f-string 中,加上正则放行了 `{}`,因此可以注入 Python 表达式,并以 root 权限执行。

![](/assets/posts/htb-interpreter/27.png)

发送一个正常的 XML 请求,确认 `notify.py` 的响应。

![](/assets/posts/htb-interpreter/28.png)

将 payload 注入到 `firstname` 字段。<br>
将 Python 表达式用 `{...}` 包裹,使 f-string 求值器在运行时执行该代码。<br>
成功获取 root flag。<br>

![](/assets/posts/htb-interpreter/29.png)

从正则的角度检查 `{open("/root/root.txt").read()}` 是否能通过:
- 字母(letters)
- `.`
- `/`
- `"`
- `(`
- `)`
- `{`
- `}`

均包含在允许的字符集合中。
此外:
- 无空格
- 无其他被禁止的特殊字符

因此可以通过正则。