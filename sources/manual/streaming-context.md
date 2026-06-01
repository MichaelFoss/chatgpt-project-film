---
title: Streaming Context
status: current
last_updated: 2026-06-01
upload_to_chatgpt: true
---

# Streaming Context

## Purpose

Define practical viewing-platform context, viewing habits, and media
access assumptions used by the Film project.

This document helps recommendations remain realistic and aligned with
actual viewing behavior.

## Core Platform Assumptions

The user's primary viewing platforms are:

- Plex
- Netflix

The user rarely:

- goes to movie theaters
- watches ad-supported streaming content intentionally
- uses Amazon Prime Video unless strongly motivated

Recommendations should consider platform friction as part of the
recommendation quality.

## Plex Context

Plex is the primary long-term media platform.

The user maintains a personal Plex media server.

Plex is now an implemented catalog source for this repository.
Plex-imported catalog entries establish catalog provenance and
membership only.

However:

- historical metadata quality is inconsistent
- some migrated metadata is unreliable
- watched-state history may be incomplete
- older watch history should not be assumed accurate

Plex should therefore be treated as:

- an implemented catalog source
- a membership provenance source
- an identifier source when stable IDs are present

Plex data should not automatically imply:

- watched status
- watch history
- completion
- preference
- ownership intent
- recommendation strength

## Plex Metadata Philosophy

Raw Plex import data should not be treated as authoritative descriptive
metadata.

Descriptive metadata should come from enrichment infrastructure and
`data/metadata-cache.json`, not from raw Plex import records.

Useful Plex-derived data may include:

- IMDb ID
- library presence
- source provenance

Potentially unreliable fields include:

- title metadata
- poster metadata
- release-year metadata
- historical watched status
- play counts
- partial viewing history
- migrated metadata

When uncertainty exists, prefer explicit user confirmation over
historical Plex assumptions.

## Netflix Context

Netflix is considered a high-availability, low-friction viewing
platform.

Recommendations available on Netflix may receive a slight practical
boost when:

- recommendation confidence is already high
- multiple options are otherwise equivalent
- the user is deciding what to watch immediately

However:

- availability alone should not drive recommendations
- Netflix popularity should not heavily influence recommendation logic

## Amazon Prime Video Context

Amazon Prime Video is considered a higher-friction platform because of:

- advertisements
- inconsistent viewing experience
- lower user enthusiasm for the platform

Recommendations that are exclusive to Prime Video should:

- justify the recommendation quality more strongly
- avoid being casually recommended solely due to popularity

A strong recommendation may still override platform friction.

## Theater Context

The user rarely attends movie theaters.

The project should therefore:

- avoid assuming theatrical viewing interest
- avoid emphasizing theatrical hype cycles
- avoid framing recommendations around “must see in theaters” language

Strong theatrical recommendations should be relatively rare.

## Viewing Time Philosophy

Viewing time is considered limited and valuable.

The user has:

- a large movie backlog
- a large television backlog
- a large video game backlog

Recommendations should therefore optimize for:

- viewing satisfaction
- worthwhile time investment
- confidence-adjusted recommendations
- pacing awareness
- commitment awareness

The recommendation system should avoid:

- filler viewing
- low-confidence time sinks
- trend chasing
- obligation viewing

## Watch Queue Philosophy

The project should help pace high-quality experiences over time.

Avoid:

- exhausting all top-tier recommendations immediately
- clustering emotionally exhausting media together
- recommending identical tones repeatedly
- optimizing only for maximum intensity

Instead:

- preserve future excitement
- maintain recommendation diversity
- balance intensity and accessibility
- maintain a sustainable long-term viewing queue

## Discovery Philosophy

The user prefers discovery through:

- word-of-mouth style recommendations
- trusted guidance
- high-level comparison
- tone and atmosphere descriptions

The user generally dislikes:

- trailers
- spoiler-heavy previews
- marketing-driven hype
- excessive pre-view information

Recommendations should therefore remain:

- concise
- spoiler-safe
- curiosity-preserving

## Availability Rules

Streaming availability should be treated as:

- a practical consideration
- not a primary recommendation driver

A weaker recommendation should not become strong merely because it is
currently easy to stream.

Likewise, a strong recommendation should not be discarded solely because
it requires more effort to access.

## Unknown Availability

If current streaming availability is unclear:

- acknowledge uncertainty
- avoid pretending availability is known
- avoid fabricating platform data

Acceptable:

```text
I am not sure where it is currently streaming, but it appears strongly
aligned with your preferences.
```

## Final Philosophy

The project should behave less like:

- a streaming algorithm
- a trending-content feed
- a platform engagement engine

and more like:

- a trusted curator
- a thoughtful viewing advisor
- a long-term media strategist

The ideal outcome is:

```text
The user consistently feels their limited viewing time was spent well.
```
