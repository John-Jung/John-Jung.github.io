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
| CVE-2026-26903 | TanStack Query | DoS via Unbounded Recursion | Medium |
| CVE-2026-25604 | Apache Airflow AWS Auth Manager | Host Header Injection | Medium |

I wrote this post for anyone wondering **Could I actually do this?** — because the answer is **yes, you can.**

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

What surprised me was that Claude upgraded itself. When I kept feeding v1's results back to the LLM, it would say things like "If we restructure the detection logic this way, we can improve both cost efficiency and the false positive rate" — and that's how v2 and v3 were born.

Here's what Claude built across v1 through v3.

#### v1: "Just Find Bugs" — The Naïve Approach

> "You are a security researcher. Find security vulnerabilities in the code."

That's almost literally the entire system prompt. The architecture was just:

1. Clone a repo
2. Chunk the source files into ~25K token blocks
3. Send each chunk to Claude with a single prompt
4. Parse the XML results

It worked — technically. The problem? **It reported everything.** A library function that takes a `command` parameter? "Command Injection!" A developer-facing API that accepts file paths? "Path Traversal!" A config option that lets you set a database URL? "SSRF!"

I tested it on a handful of repos and got hundreds of findings. Almost all of them were garbage. The false positive rate was probably over 95%.

That's when Claude realized: the scanner had no concept of **who is calling this function?** It treated every parameter as if an attacker typed it in.

---

#### v2: Multi-Phase Pipeline — Adding a Skeptic

The key insight for v2 was: **don't just find bugs, try to disprove them too.**

I restructured the scanner into a multi-phase pipeline:

- **Phase 1 — Reconnaissance**: Instead of diving straight into vulnerability hunting, first map the attack surface. Where are the HTTP handlers? Where are the dangerous sinks like `eval()` or `exec()`? Which files even deserve deep analysis?
- **Phase 2 — Deep Analysis**: Only analyze the files flagged by recon. The prompt now demands a concrete attack vector — if you can't describe how to exploit it step by step, don't report it.
- **Phase 3 — Adversarial Validation**: This was the game-changer. I send each finding back to Claude with a different persona: *"You are a skeptical security reviewer. Your job is to DISPROVE this finding."* It checks: Is the input actually user-controlled? Is there sanitization? Is this code path even reachable in production?

I also added a file priority scoring system. Files with HTTP route handlers (`app.get()`, `@PostMapping`) and user input patterns (`req.body`, `request.form`) got boosted. Test files, config files, and dev-only code got filtered out automatically.

This cut the false positive rate significantly. But there was still a fundamental problem that v2 couldn't solve.

---

#### v3: Trust Boundary Analysis — The Breakthrough

While running v2, I kept seeing the same pattern of false positives:

> "This library has a function called `execute(query)` that runs SQL without parameterization — SQL Injection!"

except the function is a **library API**. The developer who imports this library *chooses* what to pass to it. The developer is trusted. This is not a vulnerability — it's a feature.

This was the single biggest source of false positives when scanning npm packages and Java libraries. So I built **Phase 0: Target Classification**.

Before any scanning begins, v3 first answers: **"What IS this codebase?"**

It classifies targets into four trust models:

| Type | Who's trusted? | What counts as a real vulnerability? |
|------|---------------|--------------------------------------|
| **APPLICATION** | Users are untrusted | HTTP input → dangerous sink |
| **LIBRARY** | Developers are trusted | Only if external data reaches sinks WITHOUT developer mediation |
| **FRAMEWORK** | Plugin developers are trusted | Only core framework mishandling user input |
| **CLI_TOOL** | Mixed | Processed files & network responses |

The scanner detects the type by looking at `package.json` fields (`main`, `module`, `exports` → library), code patterns (`app.get()`, `req.body` → application), and structural indicators.

Then **every subsequent phase uses this trust context.** The recon prompt asks different questions for libraries vs. applications. The deep analysis prompt has trust-specific rules. And critically — any finding flagged as `requires_malicious_developer: true` gets automatically filtered out for library targets.

**This was the version that found both CVEs.** The trust boundary filter eliminated the noise, and the real vulnerabilities — where **untrusted end-user input** actually reached a dangerous sink — stood out clearly.

---

#### How I Actually Built It

**I didn't write most of the code by hand.**

My workflow was:

1. **Read and understand** Seokchan's original approach thoroughly
2. **Describe what I wanted** to Claude in detail — the architecture, the phases, the prompts
3. **Review the output** — this is where my security knowledge mattered
4. **Test against real repos** and analyze the failures
5. **Feed the failures back** to Claude: "This is a false positive. Why did it happen? How do we prevent it?"
6. **Iterate** — v1 → v2 → v3 each came from understanding WHY the previous version failed

**The key here, I think, is being able to judge whether Claude's suggested upgrade actually makes sense. If I had blindly accepted every version upgrade just because Claude proposed it, the scanner could have easily gotten worse instead of better.**

### Step 2: Scan-> Review-> Submit

Once the scanner was finalized at v3, I created reports based on the results and submitted them.

I sorted popular open-source projects — Spring, npm packages, and more — by download count, then went through them one by one: `git clone` → scan → repeat. **Over 100 repositories scanned**, with the entire month of January 2026 dedicated to this.

The scanner's raw output (XML) wasn't ready to be a report on its own. I fed each result alongside the actual source code back to Claude for **a final review — is this a false positive or a valid vulnerability?** Rather than blindly trusting the automated results, I used the LLM as a second-pass verifier.

For the findings that passed final review, I wrote up reports and submitted them. Even the report writing was AI-assisted — I had Claude study other people's CVE reports and generate drafts. Everything except the evidence (PoC screenshots, code) was written by Claude and reviewed by me.

### Results

- **Repos scanned**: 100+
- **Reports submitted**: 4
- **CVEs awarded**: 2
- **Time spent**: ~1 month (January 2026)
- **API cost**: ~₩70,000 (~$50 USD), Claude Pro subscription separate

Over 100 repos scanned, 4 reports submitted, 2 accepted as CVEs. The hit rate is brutally low. 

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
