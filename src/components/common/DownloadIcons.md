# Download Icons Documentation

This project uses high-quality, professional download icons from Bootstrap Icons for file-type specific downloads.

## Icons Used

### SVG Download Icon
- **Component**: `FiletypeSvg` from `react-bootstrap-icons`
- **Color**: Blue (#2563eb)
- **Purpose**: Indicates SVG file download
- **Hover**: Darker blue (#1d4ed8)

### PNG Download Icon
- **Component**: `FiletypePng` from `react-bootstrap-icons`
- **Color**: Green (#059669)
- **Purpose**: Indicates PNG file download
- **Hover**: Darker green (#047857)

## Implementation

```tsx
import { FiletypeSvg, FiletypePng } from 'react-bootstrap-icons';

// SVG Download Button
<button onClick={downloadSVG} title="Download SVG">
  <FiletypeSvg size={16} className="icon text-blue-600" />
</button>

// PNG Download Button
<button onClick={downloadPNG} title="Download PNG">
  <FiletypePng size={16} className="icon text-green-600" />
</button>
```

## Why These Icons?

1. **File-type specific**: Clearly indicates what format will be downloaded
2. **Professional design**: Bootstrap Icons are widely used and well-designed
3. **Color coding**: Blue for vector formats (SVG), Green for raster formats (PNG)
4. **Accessibility**: Clear tooltips and proper color contrast
5. **Consistency**: Uniform size and styling across the application

## Installation

```bash
npm install react-bootstrap-icons
```

These icons provide a much better user experience compared to generic download icons, as users can immediately understand what file format they're downloading.
