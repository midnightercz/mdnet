---
md-layout: columns
md-layout-columns: left,right
---

# Test: Column Markers in Code Blocks

This page tests that column markers inside code blocks are not parsed.

::md-layout:columns

::md-layout:column[left]

## Left Column

This shows example syntax in a code block:

```markdown
::md-layout:column[main]
Main content here...

::md-layout:column[sidebar]
Sidebar content here...
```

The above markers should be displayed as code, not parsed as actual columns.

::md-layout:column[right]

## Right Column

More code examples:

```
::md-layout:column[test]
This should also be ignored
```

And this is actual right column content.

::md-layout:columns-end
