---
name: pr-submission-guidelines
description: Create, split, review, and polish pull request submissions according to the project's PR standards. Use when Codex prepares a PR, drafts or revises a PR title/description, checks whether a PR is too broad, explains implementation/testing, or validates readiness before merge.
---

# PR Submission Guidelines

Use this skill to prepare focused pull requests with clear scope, complete descriptions, and verifiable behavior.

## Core Rules

1. Base changes on a PR workflow. Do not treat direct main-branch changes as the normal delivery path unless the user explicitly requests it.
2. Keep each PR to one thing: one PR should implement or modify a single feature or behavior. If the work contains multiple large functions or unrelated changes, split it into independent PRs.
3. Prefer small, fine-grained PRs. Encourage narrow diffs that reviewers can understand and verify quickly.
4. Keep the main branch runnable after merge. A merged PR must not leave the primary branch in a broken or non-demonstrable state.

## Scope Check

Before drafting or submitting a PR, inspect the change set and decide whether it contains exactly one logical unit.

Ask for a split or propose separate PRs when the change set includes:

- multiple user-facing features
- unrelated refactors mixed with feature work
- test or tooling rewrites that are not required for the feature
- large behavior changes that can be delivered independently
- unfinished scaffolding that would make main hard to run or review

If the PR is intentionally broad, make that tradeoff explicit in the PR description.

## PR Title

Write a one-sentence title that states what the PR adds or changes.

Good title patterns:

- `Add calendar event voice input`
- `Fix recurring reminder timezone handling`
- `Refactor notification scheduling`

Avoid vague titles such as `Update code`, `Fix bug`, or `Improve project`.

## PR Description

Include these sections whenever drafting or reviewing a PR:

```markdown
## 功能描述

说明该功能的作用与使用方式。

## 实现思路

简要说明技术选型或核心实现逻辑。

## 测试方式

说明如何验证该功能正常运行。
```

Keep each section specific to the single feature or behavior in the PR. If a section cannot be filled in, identify the missing implementation or validation work instead of omitting it silently.

## Readiness Checklist

Use this checklist before considering the PR ready:

- The PR implements or modifies only one logical feature or behavior.
- The title is a single clear sentence describing the change.
- The description includes 功能描述, 实现思路, and 测试方式.
- The testing instructions are reproducible by a reviewer.
- The main branch should remain runnable after merge.
- Any known limitations or follow-up work are called out explicitly.

## Review Response

When reviewing an existing PR or PR draft, lead with concrete gaps:

- scope problems and recommended split points
- missing or vague title/description content
- missing verification steps
- risks that may break main after merge

Then provide a corrected PR title and description when enough context is available.
