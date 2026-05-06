---
md-layout: two-column
md-layout-columns: left,right
---

# Test: Column Markers in Code Blocks

This page tests that column markers inside code blocks are not parsed.

::column[left]

## Left Column

This shows example syntax in a code block:

```markdown
::column[main]
Main content here...

::column[sidebar]
Sidebar content here...
```

The above markers should be displayed as code, not parsed as actual columns.

::column[right]

## Right Column

More code examples:

```
::column[test]
This should also be ignored
```

And this is actual right column content.
