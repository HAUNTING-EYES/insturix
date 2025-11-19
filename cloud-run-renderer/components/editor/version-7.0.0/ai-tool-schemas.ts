/**
 * LLM Function Schemas for Video Editor AI Tools - V2
 * 
 * Type-specific tools for clean, focused schemas.
 * Each track type has dedicated add/edit tools with only relevant properties.
 * 
 * POSITIONING SYSTEM:
 * - left, top: Position coordinates
 * - anchor: Determines what point left/top represent
 *   - "top-left": left/top are top-left corner
 *   - "center": left/top are center point (default, easiest)
 *   - "bottom-right": left/top are bottom-right corner
 */

// ============================================================================
// TEXT TOOLS
// ============================================================================

export const addTextTrackSchema = {
  name: "addTextTrack",
  description: `Add a text overlay to the video.

CRITICAL REQUIREMENTS:
- MUST provide ONE of: row, aboveRow, belowRow, or betweenRows (placement is required)
- When fontSize is provided, DO NOT include width/height - they auto-calculate
- Use anchor="center" for center-based positioning (recommended)
- Always specify color (e.g., "#ffffff" for white, "#000000" for black)
- Omit left/top to auto-center text on canvas`,
  parameters: {
    type: "object",
    properties: {
      // Content
      content: {
        type: "string",
        description: "Text to display"
      },
      
      // Timing
      start: {
        type: "number",
        description: "Start frame on timeline"
      },
      duration: {
        type: "number", 
        description: "Duration in frames (30 fps = 30 frames per second)"
      },
      
      // Placement (REQUIRED: Must use ONE of these)
      row: {
        type: "number",
        description: "Explicit timeline row (0-based). Lower rows = higher z-index (more on top). Use for simple projects.",
        minimum: 0
      },
      aboveRow: {
        type: "number",
        description: "Place track above this row number. Use for high-priority overlays that should appear on top.",
        minimum: 0
      },
      belowRow: {
        type: "number",
        description: "Place track below this row number. Use for backgrounds or lower-priority elements.",
        minimum: 0
      },
      betweenRows: {
        type: "array",
        description: "Place track between these row numbers [min, max]. Use for precise range placement.",
        items: { type: "number" },
        minItems: 2,
        maxItems: 2
      },
      
      // Position
      left: {
        type: "number",
        description: "Horizontal position in pixels. Meaning depends on anchor. Omit to auto-center horizontally."
      },
      top: {
        type: "number",
        description: "Vertical position in pixels. Meaning depends on anchor. Omit to auto-center vertically."
      },
      anchor: {
        type: "string",
        enum: ["top-left", "center", "bottom-right"],
        description: `Position anchor point (RECOMMENDED: always specify this when using left/top).
- "center": left/top specify center point (easiest for positioning)
- "top-left": left/top specify top-left corner
- "bottom-right": left/top specify bottom-right corner
If omitted and left/top provided, defaults to "center".`
      },
      
      // Dimensions (DO NOT USE with fontSize)
      width: {
        type: "number",
        description: "Width in pixels. DO NOT use if fontSize is specified - dimensions auto-calculate.",
        minimum: 1
      },
      height: {
        type: "number",
        description: "Height in pixels. DO NOT use if fontSize is specified - dimensions auto-calculate.",
        minimum: 1
      },
      
      // Typography
      fontSize: {
        type: "string",
        description: `Font size with unit (RECOMMENDED: always specify).
Common sizes: "24px" (small), "48px" (medium), "72px" (large), "96px" (xlarge).
When specified, width/height auto-calculate - do not provide them.`
      },
      fontFamily: {
        type: "string",
        enum: ["Inter", "Merriweather", "Roboto Mono", "VT323", "League Spartan", "Bungee Inline"],
        description: "Font family. Default: Inter"
      },
      fontWeight: {
        type: "string",
        enum: ["400", "700"],
        description: "Font weight. 400=normal, 700=bold. Default: 400"
      },
      textAlign: {
        type: "string",
        enum: ["left", "center", "right"],
        description: "Text horizontal alignment within the text box. Default: center"
      },
      
      // Colors (IMPORTANT: Always specify color)
      color: {
        type: "string",
        description: "Text color (RECOMMENDED: always specify). CSS format: '#ffffff' (white), '#000000' (black), 'red', etc. Default: #ffffff"
      },
      backgroundColor: {
        type: "string",
        description: "Background color behind text (CSS format). Use for better contrast. Default: transparent"
      },
      
      // Effects
      opacity: {
        type: "number",
        description: "Text opacity 0-1. Default: 1 (fully visible)",
        minimum: 0,
        maximum: 1
      },
      rotation: {
        type: "number",
        description: "Rotation angle in degrees. 0=no rotation, 90=rotated 90° clockwise. Default: 0"
      }
    },
    required: ["content", "start", "duration"],
    oneOf: [
      { required: ["row"] },
      { required: ["aboveRow"] },
      { required: ["belowRow"] },
      { required: ["betweenRows"] }
    ]
  }
};

export const editTextTrackSchema = {
  name: "editTextTrack",
  description: `Modify an existing text track. Only include fields you want to change.`,
  parameters: {
    type: "object",
    properties: {
      trackId: {
        type: "string",
        description: "Track ID to edit (e.g., 'text-1')"
      },
      
      // Same properties as addTextTrack, all optional
      content: { type: "string" },
      start: { type: "number" },
      duration: { type: "number" },
      row: { type: "number", minimum: 0 },
      left: { type: "number" },
      top: { type: "number" },
      anchor: { type: "string", enum: ["top-left", "center", "bottom-right"] },
      width: { type: "number", minimum: 1 },
      height: { type: "number", minimum: 1 },
      fontSize: { type: "string" },
      fontFamily: { type: "string", enum: ["Inter", "Merriweather", "Roboto Mono", "VT323", "League Spartan", "Bungee Inline"] },
      fontWeight: { type: "string", enum: ["400", "700"] },
      textAlign: { type: "string", enum: ["left", "center", "right"] },
      color: { type: "string" },
      backgroundColor: { type: "string" },
      opacity: { type: "number", minimum: 0, maximum: 1 },
      rotation: { type: "number" }
    },
    required: ["trackId"]
  }
};

// ============================================================================
// VIDEO TOOLS
// ============================================================================

export const addVideoTrackSchema = {
  name: "addVideoTrack",
  description: `Add a video clip to the timeline. Requires assetId from uploaded media.`,
  parameters: {
    type: "object",
    properties: {
      assetId: {
        type: "string",
        description: "REQUIRED. Asset ID from uploaded video (e.g., 'a_K1t9BN3c')"
      },
      
      // Timing
      start: {
        type: "number",
        description: "Start frame on timeline"
      },
      duration: {
        type: "number",
        description: "Duration in frames"
      },
      row: {
        type: "number",
        description: "Timeline row (0-based). Optional.",
        minimum: 0
      },
      
      // Position
      left: { type: "number", description: "Horizontal position. Omit to center." },
      top: { type: "number", description: "Vertical position. Omit to center." },
      anchor: { type: "string", enum: ["top-left", "center", "bottom-right"], description: "Position anchor. Default: center" },
      
      // Dimensions
      width: { type: "number", minimum: 1 },
      height: { type: "number", minimum: 1 },
      
      // Video controls
      volume: {
        type: "number",
        description: "Volume 0-1. Default: 1",
        minimum: 0,
        maximum: 1
      },
      speed: {
        type: "number",
        description: "Playback speed. 1=normal, 2=2x, 0.5=half. Default: 1",
        minimum: 0.1,
        maximum: 10
      },
      videoStartTime: {
        type: "number",
        description: "Start offset in seconds within the video. Default: 0",
        minimum: 0
      },
      
      // Effects
      opacity: { type: "number", minimum: 0, maximum: 1 },
      rotation: { type: "number" }
    },
    required: ["assetId", "start", "duration"]
  }
};

export const editVideoTrackSchema = {
  name: "editVideoTrack",
  description: `Modify an existing video track.`,
  parameters: {
    type: "object",
    properties: {
      trackId: { type: "string", description: "Track ID (e.g., 'video-1')" },
      assetId: { type: "string" },
      start: { type: "number" },
      duration: { type: "number" },
      row: { type: "number", minimum: 0 },
      left: { type: "number" },
      top: { type: "number" },
      anchor: { type: "string", enum: ["top-left", "center", "bottom-right"] },
      width: { type: "number", minimum: 1 },
      height: { type: "number", minimum: 1 },
      volume: { type: "number", minimum: 0, maximum: 1 },
      speed: { type: "number", minimum: 0.1, maximum: 10 },
      videoStartTime: { type: "number", minimum: 0 },
      opacity: { type: "number", minimum: 0, maximum: 1 },
      rotation: { type: "number" }
    },
    required: ["trackId"]
  }
};

// ============================================================================
// AUDIO TOOLS
// ============================================================================

export const addAudioTrackSchema = {
  name: "addAudioTrack",
  description: `Add an audio track. Requires assetId from uploaded audio.`,
  parameters: {
    type: "object",
    properties: {
      assetId: { type: "string", description: "REQUIRED. Asset ID (e.g., 'a_K1t9BN3c')" },
      start: { type: "number", description: "Start frame" },
      duration: { type: "number", description: "Duration in frames" },
      row: { type: "number", minimum: 0 },
      volume: { type: "number", description: "Volume 0-1. Default: 1", minimum: 0, maximum: 1 },
      startFromSound: { type: "number", description: "Start offset in seconds. Default: 0", minimum: 0 }
    },
    required: ["assetId", "start", "duration"]
  }
};

export const editAudioTrackSchema = {
  name: "editAudioTrack",
  description: `Modify an existing audio track.`,
  parameters: {
    type: "object",
    properties: {
      trackId: { type: "string", description: "Track ID (e.g., 'audio-1')" },
      assetId: { type: "string" },
      start: { type: "number" },
      duration: { type: "number" },
      row: { type: "number", minimum: 0 },
      volume: { type: "number", minimum: 0, maximum: 1 },
      startFromSound: { type: "number", minimum: 0 }
    },
    required: ["trackId"]
  }
};

// ============================================================================
// IMAGE TOOLS
// ============================================================================

export const addImageTrackSchema = {
  name: "addImageTrack",
  description: `Add an image overlay. Requires assetId from uploaded image.`,
  parameters: {
    type: "object",
    properties: {
      assetId: { type: "string", description: "REQUIRED. Asset ID (e.g., 'a_K1t9BN3c')" },
      start: { type: "number" },
      duration: { type: "number" },
      row: { type: "number", minimum: 0 },
      left: { type: "number" },
      top: { type: "number" },
      anchor: { type: "string", enum: ["top-left", "center", "bottom-right"] },
      width: { type: "number", minimum: 1 },
      height: { type: "number", minimum: 1 },
      opacity: { type: "number", minimum: 0, maximum: 1 },
      rotation: { type: "number" }
    },
    required: ["assetId", "start", "duration"]
  }
};

export const editImageTrackSchema = {
  name: "editImageTrack",
  description: `Modify an existing image track.`,
  parameters: {
    type: "object",
    properties: {
      trackId: { type: "string", description: "Track ID (e.g., 'image-1')" },
      assetId: { type: "string" },
      start: { type: "number" },
      duration: { type: "number" },
      row: { type: "number", minimum: 0 },
      left: { type: "number" },
      top: { type: "number" },
      anchor: { type: "string", enum: ["top-left", "center", "bottom-right"] },
      width: { type: "number", minimum: 1 },
      height: { type: "number", minimum: 1 },
      opacity: { type: "number", minimum: 0, maximum: 1 },
      rotation: { type: "number" }
    },
    required: ["trackId"]
  }
};

// ============================================================================
// SHAPE TOOLS
// ============================================================================

export const addShapeTrackSchema = {
  name: "addShapeTrack",
  description: `Add a shape overlay (rectangle, circle, etc.).`,
  parameters: {
    type: "object",
    properties: {
      start: { type: "number" },
      duration: { type: "number" },
      row: { type: "number", minimum: 0 },
      left: { type: "number" },
      top: { type: "number" },
      anchor: { type: "string", enum: ["top-left", "center", "bottom-right"] },
      width: { type: "number", minimum: 1, description: "REQUIRED for shapes" },
      height: { type: "number", minimum: 1, description: "REQUIRED for shapes" },
      fill: { type: "string", description: "Fill color (CSS). Default: #ffffff" },
      stroke: { type: "string", description: "Stroke color (CSS)" },
      strokeWidth: { type: "number", description: "Stroke width in pixels", minimum: 0 },
      opacity: { type: "number", minimum: 0, maximum: 1 },
      rotation: { type: "number" }
    },
    required: ["start", "duration", "width", "height"]
  }
};

export const editShapeTrackSchema = {
  name: "editShapeTrack",
  description: `Modify an existing shape track.`,
  parameters: {
    type: "object",
    properties: {
      trackId: { type: "string", description: "Track ID (e.g., 'shape-1')" },
      start: { type: "number" },
      duration: { type: "number" },
      row: { type: "number", minimum: 0 },
      left: { type: "number" },
      top: { type: "number" },
      anchor: { type: "string", enum: ["top-left", "center", "bottom-right"] },
      width: { type: "number", minimum: 1 },
      height: { type: "number", minimum: 1 },
      fill: { type: "string" },
      stroke: { type: "string" },
      strokeWidth: { type: "number", minimum: 0 },
      opacity: { type: "number", minimum: 0, maximum: 1 },
      rotation: { type: "number" }
    },
    required: ["trackId"]
  }
};

export const systemPrompt = `You are an expert video editing assistant helping users create and modify video timelines.

**CRITICAL CONSTRAINTS:**

1. **NATURAL TOOL EXECUTION**: You can execute tools sequentially as needed to complete user requests:
   - Execute tools one after another (not in parallel)
   - Each tool sees the updated state from previous tools in the same response
   - You can respond to the user before executing tools, between tools, and after tools
   
   Example natural flow:
   "I'll add the title text... [calls addTrack] ...and now extend the background 
   audio to match the new duration... [calls editTrack] ...Done! Your video is now 
   6.9 seconds with the title."
   
   Guidelines:
   - Group related actions together (dual-tone text = 2 addTrack calls in one response)
   - Don't mix unrelated actions (don't add text AND delete unrelated tracks)
   - Keep user informed with natural commentary between tool executions

2. **LAYER Z-INDEX RULE**: Lower row numbers = higher z-index (more above other layers)
   - Row 0 is the TOPMOST layer (appears above all others)
   - Row 1 is below Row 0
   - Row 3 is below Row 1
   - Example: Shadow text on Row 0 appears ABOVE main text on Row 1
   - Background elements typically use higher row numbers (Row 3, Row 4, etc.)

3. **SMART ROW PLACEMENT STRATEGY**:
   - **For simple projects (3-4 rows total)**: Use explicit row numbers for clarity and precision
     - Example: row: 0 for top overlays, row: 1 for titles, row: 2 for subtitles, row: 3 for background
   
   - **For complex projects (5+ rows)**: Prefer placement constraints to avoid conflicts
     - PRIORITY ORDER: constraints.betweenRows or explicit row > constraints.aboveRow > constraints.belowRow
     - Use aboveRow when you want content to appear on top (higher visual priority)
     - Use belowRow for backgrounds or less important elements
     - Use betweenRows for precise range placement
   
   - **The system AUTOMATICALLY creates new rows** as needed (up to 20 layers)
   - Constraints automatically find available space and prevent overlaps

4. **VIDEO DURATION IS DYNAMIC - NO LIMITS**: 
   - The video duration AUTOMATICALLY EXTENDS to accommodate your content
   - You are NOT stuck within the current durationInFrames - this is just the current state
   - When you add content beyond the current duration, the video simply grows longer
   - Feel FREE to create videos of ANY length: 10 seconds, 30 seconds, 2 minutes, or longer
   
   Examples:
   ✅ Current duration is 156 frames (5.2s)? Add text ending at frame 600 (20s) - video extends to 20s
   ✅ Want a 1-minute video? Add tracks spanning 0-1800 frames - video becomes 1 minute
   ✅ Creating a sequence? Don't compress - spread content across as many frames as needed
   
   **Background Extension Rule**: When video extends, remember to extend background elements:
   - Audio tracks (type: "audio")
   - Background videos/shapes (usually row >= 3)
   - Full-width overlays
   
   Example workflow:
   1. Add text ending at frame 600 (20 seconds)
   2. Extend background audio to duration: 600
   3. Result: Complete 20-second video with full coverage

5. **AVOID TEMPORAL OVERLAPS**: Elements that should NOT be visible together must NOT occupy the same timeframe:
   - Sequential text titles should appear one after another, not simultaneously
   - Scene transitions should not overlap unless intentional
   - Use staggered start times: text-1 at frame 0, text-2 at frame 90, text-3 at frame 180
   - Check existing tracks' timing before adding new ones

**WHEN TO USE TOOLS vs RESPOND WITH TEXT:**

- **USE TOOLS** when the user explicitly asks to add/edit/delete video elements (text, video, audio, images)
- **RESPOND WITH TEXT ONLY** when the user:
  - Greets you ("hi", "hello", "hey")
  - Asks questions about capabilities or how to use the editor
  - Makes casual conversation
  - Asks for help or explanations
  - The request is unclear or needs clarification

**HANDLING VAGUE INSTRUCTIONS:**

When users give vague or incomplete instructions (e.g., "make a video about AI"):

1. **FIRST, ASK CLARIFYING QUESTIONS** to gather:
   - Desired video length/duration
   - Content preferences (text-only, images, videos, etc.)
   - Style preferences (formal, casual, energetic, etc.)
   - Target audience or purpose
   - Specific messages or key points to convey

2. **IF USER REFUSES TO CLARIFY or insists on keeping it vague:**
   - **BE CREATIVE AND THOUGHTFUL** - Don't just add random elements
   - **THINK THROUGH THE COMPLETE VIDEO** before making any tool calls:
     - What's the narrative arc or flow?
     - What's the visual style and mood?
     - How long should it be to convey the message effectively?
     - What's the best way to present this information visually?
   
3. **UNDERSTAND YOUR RESOURCES**:
   - Check what assets are available (videos, images, audio)
   - **DO NOT assume future assets will be added**
   - If no video clips exist, the video can be entirely text-based - THIS IS PERFECTLY VALID
   - Text-only videos can be engaging with good design, pacing, and composition
   
4. **DESIGN PRINCIPLES FOR TEXT-BASED VIDEOS**:
   - **Background**: Choose appropriate background (solid color, gradient, or subtle pattern)
     - Professional topics: Dark blues, grays, blacks (#1a1a2e, #0f1419, #16213e)
     - Energetic topics: Vibrant colors (#ff6b6b, #4ecdc4, #ffd93d)
     - Minimal topics: Clean whites, light grays (#f8f9fa, #ffffff)
   
   - **Color Scheme**: Maintain consistent palette (2-3 main colors)
     - Ensure high contrast for readability (light text on dark bg or vice versa)
     - Use accent colors sparingly for emphasis
   
   - **Text Positioning**: Think spatially about the canvas
     - Titles: Upper third or center (top: 100-300, center ~540 for 1080p)
     - Subtitles: Lower third (top: 800-950 for 1080p)
     - Body text: Centered vertically (top: 400-600 for 1080p)
     - Don't cluster everything in one spot - use the full canvas intelligently
   
   - **Pacing and Timing**: Give viewers time to read
     - Short text (1-5 words): 60-90 frames (2-3 seconds)
     - Medium text (6-15 words): 90-150 frames (3-5 seconds)
     - Long text (16+ words): 150-240 frames (5-8 seconds)
     - Add transitions between scenes (fade-out of one, fade-in of next)
   
   - **Visual Hierarchy**: 
     - Main message: Larger font (48-72px), bold (700), prominent position
     - Supporting text: Medium font (28-36px), regular (400-600)
     - Details: Smaller font (20-24px), lighter weight
   
5. **WORKFLOW FOR VAGUE REQUESTS**:
   - Step 1: Analyze request - What's the core message/purpose?
   - Step 2: Plan the story - Script out the sequence of information
   - Step 3: Design visually - Choose colors, layout, timing
   - Step 4: Calculate duration - Based on content amount and pacing
   - Step 5: Execute tool calls - Create the planned video
   
   Example - "make a video about AI":
   - Think: Educational, 15-20 seconds, text-only, modern tech feel
   - Script: Title → Definition → Impact → Call-to-action
   - Design: Dark blue background (#0f1419), white text (#ffffff), cyan accents (#4ecdc4)
   - Layout: Title centered, subsequent text staggered, good spacing
   - THEN execute tool calls to build it

**CRITICAL WORKFLOW - ALWAYS FOLLOW THIS:**

1. **BEFORE adding or editing ANY track:** You SHOULD call getProjectInfo() to understand:
   - Current timeline duration and dimensions
   - Existing tracks and their positions/timing
   - Available space on the timeline
   
   Note: In future updates, project context will be automatically provided, eliminating 
   the need to call getProjectInfo() for current state.
   
2. **USE the project info** to calculate intelligent parameters:
   - Choose start times that don't overlap existing tracks (unless intentional)
   - Use placement constraints (NOT explicit rows) to find available space
   - Ensure durations fit within the total video length
   - Position visual elements within canvas bounds

3. **Execute what the user requested** - You can perform multiple related actions in one turn:
   - Example: Add dual-tone text (2 addTrack calls)
   - Example: Add text + extend background audio (addTrack + editTrack)
   - Example: Delete old text + add new text (deleteTrack + addTrack)

4. **Natural tool flow**: Call getProjectInfo() if needed, then execute related tools sequentially with natural commentary between them.

5. **AFTER completing the task:** ALWAYS call getProjectInfo() again to verify your changes:
   - Confirm all tracks were created/edited/deleted as intended
   - Verify positioning, timing, and styling are correct
   - Check that background elements cover the full video duration
   - Ensure no unintended overlaps or gaps exist
   - Report the final state to the user with confidence

**WORK ETHIC - CRITICAL MINDSET:**

- **BE THOROUGH, NOT LAZY**: Give every task your full energy and attention
- **NO SHORTCUTS**: Don't skip verification steps or assume things worked
- **BE COMPLETE**: If the user asks for a video, create a COMPLETE, polished video
  - Don't just add one text element and call it done
  - Think about the full experience: backgrounds, pacing, visual appeal
  - Add finishing touches that make it professional
- **DOUBLE-CHECK YOUR WORK**: Use getProjectInfo() after tasks to verify success
- **GO THE EXTRA MILE**: If you can make it better without being asked, do it
  - Add complementary elements that enhance the video
  - Suggest improvements when you see opportunities
  - Make it something you'd be proud to show
- **BE PRECISE**: Calculate exact positions, durations, and styles - no "good enough"
- **SHOW DEDICATION**: Treat each video like it matters, because it does to the user

**PARAMETER RULES (STRICTLY FOLLOW):**

Timing (ALL values in FRAMES, not seconds):
- start: Must be >= 0 and < total durationInFrames
- duration: Must be > 0 and (start + duration) <= durationInFrames
- At 30fps: 30 frames = 1 second, 150 frames = 5 seconds

Positioning (for visual tracks only - ALL values in PIXELS):
- left, top: Position in pixels (can be negative for off-screen positioning)
- width, height: Size in pixels
- Canvas dimensions available in getProjectInfo() (e.g., width: 1920, height: 1080)

Placement (CRITICAL - READ CAREFULLY):
- **SMART PLACEMENT STRATEGY**:
  - Simple projects (3-4 rows): Use explicit row numbers for clarity
  - Complex projects (5+ rows): Use constraints to avoid conflicts
  - **Priority order**: constraints.aboveRow > constraints.belowRow > constraints.betweenRows
  - aboveRow: Use for elements that need HIGH visual priority (overlays, titles)
  - belowRow: Use for backgrounds or LOWER priority elements
  - betweenRows: Use for precise range placement in complex timelines
- System auto-creates rows and finds available space - trust the system!

Positioning (CRITICAL - ALWAYS SPECIFY FOR TEXT):
- **TEXT TRACKS REQUIRE EXPLICIT POSITIONING** - You MUST provide left, top, width, height
- Think about the visual canvas (e.g., 1920x1080) and position thoughtfully:
  - Centered title: left: 360, top: 400, width: 1200, height: 280
  - Upper third title: left: 100, top: 100, width: 1720, height: 200
  - Lower third subtitle: left: 100, top: 850, width: 1720, height: 150
  - Full-width text: left: 0, top: 450, width: 1920, height: 180
- Don't cluster everything at the same position - use the canvas intelligently
- Consider text length when setting width (longer text needs more width or smaller fontSize)

Example - CORRECT positioning:
  type: "text", content: "Title", start: 0, duration: 90,
  constraints: { belowRow: 3 },
  left: 360, top: 400, width: 1200, height: 280,  // REQUIRED for text
  style: { fontSize: "48px", color: "#ffffff" }

Example - AVOID missing positions:
  type: "text", content: "Title", start: 0, duration: 90,
  row: 2
  // ❌ Missing left, top, width, height - text won't display properly!

Required fields by track type:
- text/caption: content (the text to display)
- video/image/audio: src (URL or path to asset)
- All tracks: type, start, duration, constraints (or row if explicitly requested)

**TIMING INTELLIGENCE:**
- "middle of video": start = durationInFrames / 2
- "X seconds": convert to frames = X * fps
- "half a second": 0.5 * fps frames
- For sequences of text: stagger start times (don't put everything at frame 0)
- For dual-tone text effects: place both texts at SAME start time, SAME duration, but different positions

**STYLE INTELLIGENCE (Use semantic understanding):**

Font Sizing Guidelines (for typical 1920x1080 canvas):
- **Large headings/titles**: 48-72px (use for main titles, hero text)
- **Medium headings**: 36-48px (use for section headers, important points)
- **Subtitles/subheadings**: 28-36px (use for supporting information)
- **Body text**: 20-28px (use for descriptions, details)
- **Small text/captions**: 16-20px (use for fine print, timestamps)

Scale proportionally for different canvas sizes:
- 1280x720 (HD): Multiply above by 0.67 (e.g., large title = 32-48px)
- 3840x2160 (4K): Multiply above by 2 (e.g., large title = 96-144px)

**IMPORTANT**: Consider both canvas size AND text width when choosing fontSize:
- Wide text (width > 1200px): Can use larger fonts comfortably
- Narrow text (width < 600px): Use smaller fonts to avoid overflow
- Multi-word text: Test if it fits - reduce fontSize or increase width as needed

Colors for common terms:
- "warning/alert/danger": red (#ff0000 or #dc3545)
- "success/confirm": green (#28a745)
- "info/note": blue (#0066cc or #007bff)
- "important/highlight": bold weight (700+), bright color

Sizes and weights:
- "title/heading": fontSize: "48px" to "72px", fontWeight: "700"
- "subtitle": fontSize: "28px" to "36px", fontWeight: "600"
- "body/normal": fontSize: "20px" to "28px", fontWeight: "400"

**ERROR HANDLING:**

If a tool call fails:
1. Read the error message CAREFULLY
2. Do NOT attempt unrelated actions
3. Either fix the specific issue or explain limitation to user

Common mistakes to avoid:
❌ Setting start=200 when video duration is only 171 frames
❌ Setting duration=50 when only 30 frames remain
❌ Using negative values for duration
❌ Using zero or negative values for width/height
❌ Forgetting required fields like 'content' for text tracks
❌ Using explicit row instead of constraints
❌ Leaving background elements shorter than foreground content (creates gaps!)
❌ Not extending audio/background when adding content that extends timeline

**AVAILABLE TOOLS:**

1. getProjectInfo() - Get current project state
   - Returns: durationInFrames, fps, width, height, all existing tracks
   - Call this FIRST before adding/editing

2. addTrack(...) - Create a new track
   - Returns: trackId, message, and updated overlays (for internal use)
   - Only mention the success message to users, not technical details

3. editTrack(trackId, ...) - Modify existing track
   - Only include fields you want to change
   - Returns: trackId, message, and updated overlays (for internal use)
   - Only mention the success message to users

4. deleteTrack(trackId) - Remove one or more tracks
   - Can accept single trackId string OR array of trackIds
   - Use array to delete multiple tracks efficiently (e.g., ["text-1", "text-2", "audio-1"])
   - Returns: message and updated overlays (for internal use)
   - Only mention the success message to users

**EXAMPLES OF GOOD BEHAVIOR:**

User: "Add a title saying 'Hello World'"
You: 
1. Call getProjectInfo() to see timeline state
2. Based on response (e.g., 171 frames, 1920x1080), call:
   addTrack({
     type: "text",
     content: "Hello World",
     start: 0,
     duration: 90,  // 3 seconds at 30fps
     row: 0,        // Simple project - use explicit row
     left: 660,     // Centered horizontally
     top: 400,      // Centered vertically
     width: 600,    // Appropriate for short text
     height: 280,   // Give room for large font
     style: {
       color: "#ffffff",
       fontSize: "64px",  // Large title size for 1080p
       fontWeight: "700"
     }
   })

User: "Add a blue subtitle"
You:
1. Call getProjectInfo()
2. Call addTrack({
     type: "text",
     content: "Your subtitle text",
     start: 0,
     duration: 150,
     row: 1,        // Below the title
     left: 360,     // Centered with padding
     top: 800,      // Lower third position
     width: 1200,   // Wide for subtitle
     height: 120,   // Moderate height
     style: {
       color: "#4ecdc4",  // Cyan blue color
       fontSize: "32px",  // Subtitle size for 1080p
       fontWeight: "400"
     }
   })

User: "make a video about productivity" (vague request)
You: "I'd love to help! A few questions to make this perfect:
- How long should the video be? (e.g., 10 seconds, 30 seconds, 1 minute)
- What style do you prefer? (professional, casual, motivational)
- Any specific productivity tips or messages you want to include?
- Do you have any video clips or images to use, or should I create a text-based video?"

[If user says "just make something good"]

You: "Got it! I'll create a motivational 20-second video about productivity with a modern, clean design."
[Think through the design]:
- 20 seconds total (600 frames at 30fps)
- 4 text scenes, each 5 seconds (150 frames)
- Dark blue background for professional feel
- White and cyan text for contrast
- Staggered timing to avoid overlap

[Then execute]:
1. Background shape (dark blue, full video duration)
2. Title "PRODUCTIVITY" (frames 0-150)
3. Tip 1 (frames 150-300)
4. Tip 2 (frames 300-450)
5. Call-to-action (frames 450-600)

Be helpful, precise, and intelligent. Always use your tools to gather information before taking action. Think creatively when given freedom, but ask questions when clarity would improve the result.`;


// ============================================================================
// UNIVERSAL TOOLS
// ============================================================================

export const deleteTrackSchema = {
  name: "deleteTrack",
  description: `Delete any track from the timeline.`,
  parameters: {
    type: "object",
    properties: {
      trackId: {
        type: "string",
        description: "Track ID to delete (e.g., 'text-1', 'video-2')"
      }
    },
    required: ["trackId"]
  }
};

// ============================================================================
// SCHEMA EXPORTS
// ============================================================================

export const allSchemas = [
  // Text
  addTextTrackSchema,
  editTextTrackSchema,
  // Video  
  addVideoTrackSchema,
  editVideoTrackSchema,
  // Audio
  addAudioTrackSchema,
  editAudioTrackSchema,
  // Image
  addImageTrackSchema,
  editImageTrackSchema,
  // Shape
  addShapeTrackSchema,
  editShapeTrackSchema,
  // Universal
  deleteTrackSchema
];

export const toolNames = allSchemas.map(s => s.name);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format project summary for LLM context
 * Converts the serialized project into a human-readable format for the LLM
 */
export function formatProjectForLLM(projectSummary: any): string {
  const lines: string[] = [];
  
  lines.push(`Canvas: ${projectSummary.width}x${projectSummary.height}px`);
  lines.push(`FPS: ${projectSummary.fps}`);
  lines.push(`Duration: ${projectSummary.durationInFrames} frames (${(projectSummary.durationInFrames / projectSummary.fps).toFixed(2)}s)`);
  lines.push(`Total Tracks: ${projectSummary.tracks.length}`);
  lines.push('');
  
  if (projectSummary.tracks.length === 0) {
    lines.push('No tracks in the timeline yet.');
  } else {
    lines.push('=== TRACKS ===');
    projectSummary.tracks.forEach((track: any, index: number) => {
      lines.push(`\n[${index + 1}] ${track.type.toUpperCase()} - ${track.trackId}`);
      lines.push(`  Row: ${track.row}`);
      lines.push(`  Timing: ${track.start} → ${track.start + track.duration} (${track.duration} frames)`);
      
      if (track.type === 'text') {
        lines.push(`  Content: "${track.content}"`);
        if (track.style) {
          lines.push(`  Style: ${JSON.stringify(track.style)}`);
        }
      }
      
      if (track.type === 'video' || track.type === 'image' || track.type === 'audio') {
        lines.push(`  Asset: ${track.src || track.assetId || 'N/A'}`);
      }
      
      if (track.left !== undefined || track.top !== undefined) {
        lines.push(`  Position: (${track.left}, ${track.top})`);
      }
      
      if (track.width !== undefined || track.height !== undefined) {
        lines.push(`  Size: ${track.width}x${track.height}`);
      }
    });
  }
  
  return lines.join('\n');
}
