# Prompt: Update Source Document

## Purpose

Use this prompt when new durable information should be incorporated into
a source document.

## Prompt

You are helping maintain a Git-based ChatGPT Project context repository.

Given:

1. the existing source document
2. the new information
3. any user instructions about scope

Update the source document so that it remains:

- accurate
- concise
- retrieval-friendly
- clearly dated
- free of unnecessary chat history
- explicit about uncertainty or conflicts

Rules:

- Preserve existing useful structure.
- Do not add unsupported facts.
- Do not silently resolve conflicts.
- Keep current facts separate from historical facts.
- Update `last_updated` if the document changed.
- Suggest a changelog entry if the change is meaningful.

Return:

1. the updated document
2. a brief change summary
3. any unresolved questions
