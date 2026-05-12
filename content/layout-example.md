---
title: Layout Example
md-layout: columns
md-layout-columns: main,sidebar
md-layout-columns-width: 65%,35%
---

# Columns Layout Example

This page demonstrates the columns layout feature in MDNet.

::md-layout:columns

::md-layout:column[main]

## Main Content Area

This is the main content column. It takes up 65% of the width as specified in the front matter.

### Features

The columns layout supports:

- **Custom column names** - Define any column names you want
- **Configurable widths** - Set specific widths for each column using `md-layout-columns-width`
- **Column order** - Specify the order with `md-layout-columns`
- **Responsive design** - Automatically stacks on mobile devices
- **Layout toggle** - Click the button in the top-right to switch layouts

### How It Works

Content is divided using the `::md-layout:column[name]` marker, wrapped in layout boundaries:

```markdown
::md-layout:columns

::md-layout:column[main]
Main content here...

::md-layout:column[sidebar]
Sidebar content here...

::md-layout:column[main]
More main content (columns can interleave)

::md-layout:columns-end
```

### Multiple Sections

You can have multiple `::md-layout:column[main]` blocks throughout your document. They will all be aggregated into the same column.

This allows you to structure your content naturally while maintaining the column layout.

### Navigation

Check out:
- [[index|Home page]]
- [[example|Examples]]
- [[frontmatter-example|Front matter]]
- [[features|Features]]

::md-layout:column[sidebar]

## Sidebar

This is the sidebar column (35% width).

### Quick Info

**Layout**: Columns  
**Main width**: 65%  
**Sidebar width**: 35%

### Notes

The sidebar is perfect for:
- Related links
- Metadata
- Quick references
- Table of contents
- Callouts

### Tips

Use the layout toggle button (☰) in the top-right corner to switch between simple and column layouts.

### Related Pages

- [[example]]
- [[features]]
- [[frontmatter-example]]

::md-layout:column[main]

## Back to Main

This section is also in the main column, demonstrating that columns can have multiple sections.

### Front Matter Configuration

```yaml
md-layout: columns
md-layout-columns: main,sidebar
md-layout-columns-width: 65%,35%
```

The `md-` prefix is required for all MDNet-specific properties to avoid conflicts with other systems.

::md-layout:columns-end
