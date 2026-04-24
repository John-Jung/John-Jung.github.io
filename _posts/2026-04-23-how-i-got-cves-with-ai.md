---
layout: post
title: "How an Ordinary Person Got CVEs by Following Elite Hackers (feat: HEY, you can do it too!)"
description: "How I used AI to find vulnerabilities in TanStack Query and Apache Airflow and actually got CVEs assigned. Yes, you can do it too."
date: 2026-04-23
lang: en
permalink: /posts/how-i-got-cves-with-ai/
tags: [CVE, AI, Bug Hunting, Claude, Open Source]
---

## Introduction

I'm a perfectly ordinary person.

I majored in Computer Science, sure, but I had zero security experience before graduating. This time last year (April 2025), the only thing on my record was a single Stored XSS I'd reported to KISA — mostly by luck.

Then, **using AI, I discovered vulnerabilities in TanStack Query (50 million weekly npm downloads) and Apache Airflow — massive open-source projects — and actually got CVEs assigned.**

| CVE ID | Target | Vulnerability | Severity |
|--------|--------|---------------|----------|
| CVE-2026-26903 | TanStack Query (50M weekly DL) | DoS via Unbounded Recursion | Medium |
| CVE-2026-25604 | Apache Airflow AWS Auth Manager | Host Header Injection | Medium |

I wrote this post for anyone wondering "Could I actually do this?" — because the answer is **yes, you can.**

---

## The Beginning: Finding an Oasis on the Internet

It all started with a blog post by Seokchahn Yoon (ch4n3).

> [How a $5 Prompt Found a $2,418 Vulnerability](https://new-blog.ch4n3.kr/llm-found-security-issues-from-django-ko/)

I read that post countless times. Whenever I didn't understand something, I'd feed it to Claude and have it explain — like 3 times

I'd like to take this opportunity to sincerely thank Seokchan Yoon.

---

## What I Did and How I Did It

### Tools: Claude Pro + Claude API

Nothing fancy. **A Claude Pro subscription and the Claude API** — that's all I used.

### Step 1: Building a Scanner

Based on Seokchan's post, I instructed Claude to build a vulnerability scanner. I started with a simple structure (v1) and iterated to reduce false positives, **evolving it to v3**.

The key was **Trust Boundary Analysis**. For example, even if a library function looks dangerous, if it's a developer-facing API that the developer calls directly, that's not a vulnerability. Automating this distinction was the core of scanner v3.

### Step 2: Scanning Everything in Sight

I sorted popular open-source projects on Spring, npm, and other ecosystems by download count, then went through them one by one: `git clone` → scan, repeat.

**I scanned over 100 repositories**, investing the entire month of January 2026.

### Step 3: Final Review with an LLM

I fed the scanner results (XML) along with the actual source code back to Claude for final verification — is this a real finding or a false positive? Rather than blindly trusting the automated results, I used the LLM as a **second-pass reviewer**.

### Step 4: Writing and Submitting Reports

For the reports, I had Claude study other people's CVE reports and draft mine. Apart from the evidence (PoC screenshots, code), Claude wrote most of it and I just reviewed.

### Results

- **Reports submitted**: 4
- **CVEs accepted**: 2
- **Time invested**: ~1 month (January 2026)
- **API cost**: ~$50 USD (Claude Pro subscription separate)

I scanned 100+ repos, submitted 4 reports, and 2 of them were accepted. The hit rate is quite low when you think about it. But those 2 became real CVEs.

---

## Insight: Become Someone Who Uses AI Well

I had never hunted for CVEs before AI came along. I couldn't even grasp the thought process that experienced researchers used to find vulnerabilities.

But in the age of AI, **I proved that even an ordinary person like me can get CVEs assigned.**

Honestly, it feels great — but as someone who just entered the industry, it's also a little scary wondering if AI will replace me.

Still, after spending a month on this, there's one thing I know for certain:

**AI isn't omnipotent. It performs only as well as the person using it.**

Ask a dumb question, get a dumb answer. Ask a smart question, get a smart answer. Anyone who's used AI probably knows exactly what I mean.

At the end of the day, AI is a tool — and **what matters is becoming someone who wields that tool well.**

---

## Closing Thoughts

I'm someone who, for one reason or another, started hacking and security later than most. I only really began after graduating.

This time last year (April 2025), aside from one lucky Stored XSS report to KISA, I had nothing to show. Since then I've sought out talented researchers, studied with them, and gradually built up results in bug bounties.

My goal at the start of this year (January 2026) was **"I will get a CVE, no matter what!"** — and somehow, through a messy and stumbling process, it actually happened.

**I hope this post can be even a small help to ordinary people like me.**

Thank you for reading.

---

### Related Links

- **Scanner source code**: [github.com/John-Jung/CVE-Hunter](https://github.com/John-Jung/CVE-Hunter)
- **The post that started it all**: [How I Found a $2,418 Vulnerabilities with a $5 Prompt](https://new-blog.ch4n3.kr/llm-found-security-issues-from-django-en/)
