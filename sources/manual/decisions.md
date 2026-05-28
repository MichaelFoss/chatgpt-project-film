---
title: Decisions
status: current
last_updated: 2026-05-16
upload_to_chatgpt: false
---

# Decisions

This document records durable project decisions.

## Decision Log

### 2026-05-16: Use Git as Canonical Source of Truth

The Git repository is the maintained source of truth.

The ChatGPT Project consumes selected files from this repository, but
uploaded files are treated as derived runtime context.

### 2026-05-16: Keep Project Instructions Small

ChatGPT Project Instructions should define behavior only.

Durable factual context belongs in `sources/`.

### 2026-05-16: Use Markdown Source Documents

Markdown is the default format for curated project context because it is
diffable, readable, and easy to maintain.

### 2026-05-16: Use JavaScript Scripts with ES Modules

Repository automation should use `.js` files with ES modules instead of
shell scripts.

### 2026-05-16: Use Yarn

Yarn is the package manager for this repository.
