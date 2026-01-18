# Product Page Refactor & Navbar Update Task

## Objective
Refactor the main navigation bar to replace the "Products" dropdown with a single link to a newly created, highly interactive, and visually stunning Products page (`/products`). This page will showcase the Insturix product ecosystem with a creative flow, highlighting the core utility of each tool using their specific accent colors.

**Recommended AI Models for Implementation:**
*   Claude Opus 4.5
*   Gemini 3 Pro
*   GPT 5.2

## 1. Navbar Updates
**File:** `components/Navbar.tsx`

*   **Remove Dropdown:** Modify the `menuItems` configuration. The "Product" item should no longer have `subItems` (the dropdown).
*   **Direct Link:** Change the "Product" item to be a direct link to `/products`.
*   **Cleanup:** detailed "Meditron" is no longer supported. Ensure it is removed from the navigation logic entirely.

## 2. New Products Page (`app/products/page.tsx`)
Create a new page at `/products`. This page must be **interactive** and **beautiful**, avoiding static lists. It should have a cohesive visual flow (e.g., scroll-triggered animations, dynamic sections) that guides the user through the ecosystem.

### Design Principles
*   **Consistency:** Maintain the **fonts, theme, and visual hierarchy** of the home landing page to ensure brand consistency.
*   **Creative Liberty:** While maintaining consistency, feel free to **go creative** with the layout and interactions to make this specific page stand out.
*   **Interactive:** Use animations (Framer Motion recommended) to make the experience engaging.
*   **Creative Flow:** Don't just list them; tell a story or use a creative layout (e.g., sticky scrolling, horizontal sections, 3D elements).
*   **Visuals:** Use the specific accent colors for each product to create distinct themes for each section.

### Product Details & Accent Colors

| Product | Accent Color | Description / Core Utility |
| :--- | :--- | :--- |
| **ThinkForge** | `#ef4444` (Red) | **Idea Generation & Brainstorming.**<br>Find ideas or continue with existing ones, then research and brainstorm with AI to finalize scripts. |
| **Clickatron** | `#9333EA` (Purple) | **AI Image Generation & Editing.**<br>Create and edit thumbnails, posters, or assets with granular control using a web-based AI image editor. |
| **Editron** | `#14B8A6` (Teal) | **Web-based Video Editing.**<br>Edit videos instantly on the web with powerful AI tools. |
| **Alyzitron** | `#3B81F5` (Blue) | **Video Analysis & Metrics.**<br>Upload videos for AI analysis. Get detailed metrics on dynamic categories, final reviews, strengths, weaknesses, and recommendations. Analyzes text, video, script, and content. |
| **Musitron** | `#EAB308` (Amber) | **AI Music Generator.**<br>Support for multiple top models in one place. Easy access to copyright-free music for content creation. |
| **Socialize** | `#0EA5E9` (Sky/Cyan) | **Customizable Bio Links.**<br>All your links in one place with a fast-loading, simple, and aesthetic UI. *Note: Do NOT mention "Linktree" in the actual UI text.* |

## 3. Clean Up
*   **Delete Meditron:** The "Meditron" product is deprecated.
    *   Remove it from the Navbar.
    *   Delete the `app/products/meditron` directory and any related components if they exist.
