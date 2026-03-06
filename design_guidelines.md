# Gleam - Design Guidelines

## 1. Brand Identity

**Purpose**: Gleam transforms beauty tutorial videos into actionable shopping lists by identifying products and matching them to users' skin tones. It solves the frustration of "what product is that?" while watching makeup tutorials.

**Aesthetic Direction**: **Editorial/Magazine** - Sophisticated, curated, typographic hierarchy. Think Vogue meets tech. The app should feel like a premium beauty magazine that happens to be interactive.

**Memorable Element**: The product matching moment - when detected items transform from AI-identified descriptions into beautiful product cards with images, prices, and personalized shade recommendations. This is the "wow" moment that makes the app unforgettable.

**Target Audience**: Beauty enthusiasts (18-35) who watch GRWM videos on TikTok/Instagram and want to recreate looks without endless searching.

## 2. Navigation Architecture

**Root Navigation**: Tab Navigation (3 tabs)
- **Analyze** (tab icon: video/play symbol) - Share and analyze videos
- **My Looks** (tab icon: bookmark) - Saved product lists and tutorials
- **Profile** (tab icon: user) - Settings, selfies, skin tone profile

**No Authentication Required** - Data stored locally. Profile screen includes:
- User avatar (customizable, 1 preset generated)
- Display name
- Saved selfies for skin tone matching
- App preferences (theme, notifications)

## 3. Screen-by-Screen Specifications

### 3.1 Analyze Screen (Landing)
**Purpose**: Entry point for sharing videos and viewing analysis status

**Layout**:
- Transparent header, no title
- Scrollable content area
- Safe area: top inset = headerHeight + 32px, bottom = tabBarHeight + 32px

**Components**:
- Hero section: Large "Share a Video" button with subtitle "Tap to share from TikTok, Instagram, or YouTube"
- Recent analyses list (card-based, showing thumbnail, source, date)
- Empty state: Illustration showing phone with share icon + beauty products floating out

**Interaction**: Tapping share button triggers iOS share sheet documentation

### 3.2 Video Analysis Screen (Modal)
**Purpose**: Display AI analysis in progress and results

**Layout**:
- Custom header with close button (top-left), title "Analyzing Video"
- Scrollable content
- Safe area: top = insets.top + 24px, bottom = insets.bottom + 24px

**Components**:
- Video preview player (16:9 aspect ratio, rounded corners)
- Loading state: Animated shimmer cards with "Identifying products..."
- Results state:
  - Section header: "Detected Products" (count badge)
  - Product cards grid (2 columns, showing matched product images)
  - Section header: "Tutorial Steps"
  - Step-by-step numbered list with timestamps

**Floating Action**: "Add to My Looks" button (bottom-right, with drop shadow: offset {0,2}, opacity 0.10, radius 2)

### 3.3 Product Detail Screen (Stack)
**Purpose**: Show matched product with shade recommendation

**Layout**:
- Default navigation header with back button, product name as title
- Scrollable content
- Safe area: top = 24px, bottom = tabBarHeight + 24px

**Components**:
- Hero image (product photo, square, full-width)
- Brand name (small caps)
- Product name (large, bold)
- Price badge
- "Recommended Shade" section with visual swatch
- "Your skin tone" indicator (if selfie uploaded, otherwise prompt to upload)
- "View all shades" expandable list
- Description text
- "Add to Shopping List" button (full-width, below content)

### 3.4 Shopping List Screen (in My Looks)
**Purpose**: View saved products for a specific tutorial

**Layout**:
- Custom header with back button, tutorial title, share button (top-right)
- Scrollable list
- Safe area: top = headerHeight + 24px, bottom = tabBarHeight + 24px

**Components**:
- Tutorial video thumbnail (tappable to replay)
- "Products" section: List of saved product cards (horizontal scroll or vertical list)
- Each card: Product image, name, brand, price, recommended shade badge
- Total price summary footer
- Empty state if no products added

### 3.5 Selfie Capture Screen (Modal)
**Purpose**: Upload selfie for skin tone analysis

**Layout**:
- Full-screen camera view
- Custom header (transparent) with close button and "Analyze Skin Tone" title
- Safe area: top = insets.top + 24px, bottom = insets.bottom + 24px

**Components**:
- Camera viewfinder (full-screen)
- Face guide overlay (oval outline, centered)
- Instructions text: "Position your face in the frame for best results"
- Capture button (large circle, bottom-center)
- Gallery icon (bottom-right) to pick existing photo

**Post-capture**: Shows preview with "Analyzing..." then "Skin tone saved" confirmation

### 3.6 My Looks Screen (Tab)
**Purpose**: Browse saved tutorials and product lists

**Layout**:
- Default navigation header with title "My Looks"
- Scrollable grid/list
- Safe area: top = 24px, bottom = tabBarHeight + 24px

**Components**:
- Grid of saved look cards (2 columns): video thumbnail, title, product count, date
- Empty state: Illustration with "No saved looks yet" message and "Analyze a video to get started" subtitle

### 3.7 Profile Screen (Tab)
**Purpose**: User customization and settings

**Layout**:
- Default navigation header with title "Profile"
- Scrollable form
- Safe area: top = 24px, bottom = tabBarHeight + 24px

**Components**:
- Avatar (large, circular, tappable to change)
- Display name field
- "Skin Tone Profile" section: Show saved selfies (horizontal scroll), "Add new selfie" button
- Settings list: Theme toggle, Notifications toggle
- App info: Version, Privacy Policy link, Terms link

## 4. Color Palette

**Primary**: `#C77D8E` (Dusty rose - sophisticated, beauty-forward, memorable)
**Primary Dark**: `#A65D6E` (for pressed states)
**Background**: `#FAFAFA` (soft white, not harsh pure white)
**Surface**: `#FFFFFF` (cards, elevated elements)
**Surface Secondary**: `#F5F5F5` (subtle backgrounds for sections)
**Text Primary**: `#1A1A1A` (near-black, easier on eyes than pure black)
**Text Secondary**: `#6B6B6B` (for metadata, timestamps)
**Text Tertiary**: `#999999` (for placeholders)
**Border**: `#E8E8E8` (subtle dividers)
**Success**: `#4CAF50` (for confirmations)
**Warning**: `#FF9800` (for alerts)

## 5. Typography

**Font Family**: "Playfair Display" for headings (editorial, luxurious) + "Inter" for body text (legible, modern)

**Type Scale**:
- Display: 32px, Playfair Display Bold (screen titles on landing)
- H1: 28px, Playfair Display Bold (section headers)
- H2: 22px, Playfair Display SemiBold (card titles)
- H3: 18px, Inter SemiBold (subsections)
- Body: 16px, Inter Regular (main content)
- Body Small: 14px, Inter Regular (metadata)
- Caption: 12px, Inter Medium, uppercase (labels, badges)

## 6. Assets to Generate

**icon.png** - App icon for home screen
- Stylized "G" monogram in dusty rose on white background, minimal geometric design

**splash-icon.png** - Launch screen icon
- Same "G" monogram, centered

**empty-analyze.png** - For Analyze screen when no recent videos
- Illustration: Minimalist phone outline with share icon, beauty product silhouettes (lipstick, mascara) floating elegantly upward, dusty rose accents, editorial style

**empty-looks.png** - For My Looks screen when empty
- Illustration: Open magazine/catalog pages with product placeholders, bookmark icon, soft pastel style

**avatar-preset.png** - Default user avatar
- Simple circular silhouette, dusty rose gradient background

**face-guide-overlay.png** - For selfie capture screen
- Oval face outline, minimal style, white stroke with slight glow

---

**Design Principles**:
- Generous whitespace (minimum 24px margins on all screens)
- Rounded corners on all cards/images (12px radius)
- Subtle shadows only on floating buttons (never on cards)
- Smooth transitions between states (300ms ease-in-out)
- Product images always prioritized (large, high-quality display)
- Text hierarchy through weight and size, not color
- Touch targets minimum 44x44px (Apple HIG compliance)