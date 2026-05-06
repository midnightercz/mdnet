---
title: Property Search Example
author: MDNet
category: Tutorial
status: published
difficulty: intermediate
md-tags: [search, properties, tutorial]
---

# Property Search Example

This page demonstrates the property search feature in MDNet.

## What is Property Search?

Property search allows you to search pages based on their front matter properties using a special syntax.

## Syntax

```
property:operator:value
```

Where:
- `property` - The front matter property name
- `operator` - One of: `==`, `!=`, `has`, `!has` (optional, defaults to `==`)
- `value` - The value to search for

## Operators

### Equals (`==` or empty)

Find pages where a property equals a specific value:

- `author:MDNet` - finds pages by MDNet (defaults to ==)
- `status:==published` - finds published pages
- `category:Tutorial` - finds pages in Tutorial category

### Not Equals (`!=`)

Find pages where a property does NOT equal a value:

- `status:!=draft` - finds non-draft pages
- `difficulty:!=beginner` - finds non-beginner pages

### Has (`has`)

Find pages where a property (array) contains a value:

- `md-tags:has:search` - finds pages with "search" in tags
- `md-tags:has:tutorial` - finds tutorial pages

### Not Has (`!has`)

Find pages where a property (array) does NOT contain a value:

- `md-tags:!has:draft` - finds pages without "draft" tag

## This Page's Properties

This page has the following properties you can search for:

```yaml
title: Property Search Example
author: MDNet
category: Tutorial
status: published
difficulty: intermediate
md-tags: [search, properties, tutorial]
```

## Try These Searches

Open the search (🔍) and try:

1. `author:MDNet` - finds this page and others by MDNet
2. `category:Tutorial` - finds tutorial pages
3. `status:published` - finds published pages
4. `difficulty:intermediate` - finds intermediate-level pages
5. `md-tags:has:properties` - finds pages about properties

## Combining with Other Search Types

Property searches can be used alongside:
- Text search: `"property"` - searches titles/headings
- Tag search: `#tutorial` - searches tags
- Property search: `category:Tutorial` - searches properties

## Use Cases

Property search is useful for:

- **Finding by author** - `author:YourName`
- **Filtering by status** - `status:published` or `status:!=draft`
- **Category browsing** - `category:Tutorial`, `category:Guide`
- **Difficulty levels** - `difficulty:beginner`, `difficulty:advanced`
- **Custom metadata** - Any property you add to front matter!

## Navigation

- [[search-example|Search documentation]]
- [[index|Back to home]]
- [[hashtag-example|Hashtag links]]
