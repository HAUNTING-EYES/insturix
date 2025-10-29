# Creators Assets

This directory contains profile pictures for creators featured on the ICS'25 landing page.

## Guidelines

### Image Specifications
- **Format**: JPG or PNG
- **Size**: 400x400px minimum (square)
- **Quality**: High resolution, clear face
- **File size**: Optimize to <200KB per image

### Naming Convention
- Use lowercase letters
- Separate words with hyphens
- Example: `creator-name.jpg`

### Examples
```
creators/
├── tanmay-bhat.jpg
├── carry-minati.jpg
├── bhuvan-bam.jpg
├── ashish-chanchlani.jpg
└── README.md (this file)
```

## Usage
Reference images in `components/ics25/Creators.tsx` like:
```typescript
avatar: "/creators/creator-name.jpg"
```

Note: Path starts with `/creators/` (no `public/` prefix) - Next.js serves files from `/public/` at the root.
