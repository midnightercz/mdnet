---
title: Page Width Example
md-page-width: 60%
---

# Page Width Example

This page demonstrates the `md-page-width` property, which controls how wide the content area is.

## Current Settings

This page is set to **60%** width using:

```yaml
md-page-width: 60%
```

## Default Behavior

- **Default width**: 80% (when `md-page-width` is not specified)
- **This page**: 60%
- **Can use**: percentages (60%, 80%, 100%) or fixed units (900px, 1200px)

## Examples

### Narrow Page (50%)
```yaml
md-page-width: 50%
```
Good for: Reading-focused content, articles, documentation

### Default (80%)
```yaml
# No md-page-width property needed
```
Good for: General content, balanced layout

### Wide Page (95%)
```yaml
md-page-width: 95%
```
Good for: Dashboards, tables, data-heavy content

### Full Width (100%)
```yaml
md-page-width: 100%
```
Good for: Maximizing screen space

## Navigation

Compare with other pages:
- [[index]] - Default 80% width
- [[layout-example]] - Two-column layout with default width
- [[features]] - Features overview

## Notice

You can see this page is narrower than the default pages. Try navigating to the [[index|home page]] to see the difference!
