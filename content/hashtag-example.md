---
title: Hashtag Links Example
md-tags: [hashtags, navigation, search]
---

# Hashtag Links Example

This page demonstrates clickable hashtags in MDNet.

## What are Hashtag Links?

Hashtags like #example, #navigation, and #search are automatically detected in text and converted to clickable links.

## How They Work

When you click a hashtag:
1. The search modal opens automatically
2. The search is pre-filled with the clicked tag
3. All pages containing that tag are shown

## Try It Out!

Click on any of these hashtags to see the feature in action:

- #example - Find example pages
- #tag1 - Find pages with tag1
- #tag2 - Find pages with tag2
- #tag3 - Find pages with tag3
- #search - Find pages about search
- #navigation - Find navigation-related pages
- #hashtags - Find pages about hashtags (this page!)

## Styling

Hashtags are styled differently from regular links:
- **Wiki links** (`[[page]]`) are styled in green
- **Regular links** (`http://...`) are styled in blue
- **Hashtags** (`#tag`) are styled in cyan

All three types have the same hover behavior - the background changes to the link color and the text becomes the background color.

## Mixed Usage

You can mix hashtags with wiki links: See the [[example]] page which has #tag1, #tag2, and #tag3.

Check out [[search-example]] to learn more about the search system that powers hashtag navigation.

## Technical Details

Hashtags are:
- Detected in markdown text during rendering
- Must start with `#` followed by letters, numbers, underscores, or dashes
- Automatically linked to the search functionality
- Indexed from both text content and `md-tags` front matter

## Navigation

- [[index|Back to home]]
- [[example|Example page with tags]]
- [[search-example|Search documentation]]
