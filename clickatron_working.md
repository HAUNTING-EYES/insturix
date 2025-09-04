# Clickatron: Technical Implementation Guide

## Core Architecture

### State Management with Zustand

Clickatron uses Zustand for centralized state management. The store holds the entire creative session state and provides actions for updating it.

The store manages:

- **Current task**: Complete session data including canvas and variations
- **Sync status**: Loading states and error handling for background saves
- **Actions**: Methods for creating sessions, selecting ideas, and syncing canvas changes

All state updates use Immer's `produce` function to ensure immutability when modifying nested objects like the canvas data.

### Optimistic Updates with Intelligent Merging

Clickatron provides instant UI feedback through optimistic updates with intelligent conflict resolution. When users make changes:

1. **Immediate UI Update**: Changes appear instantly in the interface
2. **Background Sync**: API call happens in the background with intelligent merging
3. **Conflict Resolution**: Frontend and backend changes are merged intelligently:
   - **Frontend-controlled fields**: User modifications (fineTuning, prompt edits) take precedence
   - **Backend-controlled fields**: Generation status and image URLs are preserved when completed
4. **Error Recovery**: If the API call fails, the UI automatically reverts to the previous state
5. **State Synchronization**: After successful sync, latest state is fetched to ensure consistency

This pattern ensures the interface feels responsive while preventing conflicts between user edits and background generation processes.

### Auto-save with Debouncing and Intelligent Merging

Changes are automatically saved to prevent data loss with intelligent conflict resolution. The system uses a 1-second debounce delay, meaning it waits for users to stop making changes before syncing to the backend. 

**Key Features:**
- **Debounced Sync**: Prevents excessive API calls while ensuring no work is lost
- **Intelligent Merging**: Resolves conflicts between frontend user edits and backend generation updates
- **Field Separation**: 
  - Frontend controls: fineTuning parameters, user prompt modifications
  - Backend controls: variation status, generated image URLs
- **State Consistency**: Post-sync state refresh ensures UI reflects latest backend state

This prevents the common issue where frontend autosave overwrites backend generation completion status.

### API Design

The API follows RESTful patterns with these main endpoints:

- **Session Management**: Create, fetch, and update creative sessions
- **Idea Selection**: Choose from AI-generated creative directions
- **Canvas Sync**: Save canvas changes with variations and fine-tuning
- **History**: Retrieve user's past sessions

All requests are validated using Zod schemas to ensure data integrity. Authentication is handled through Clerk, with user isolation enforced at the database level.

### Database Design

Clickatron uses MongoDB with a single collection for all creative sessions. Each document contains:

- **User identification**: Links sessions to specific users
- **Session metadata**: Video idea, aspect ratio, creation timestamps
- **Creative workflow**: Generated ideas and user selections
- **Canvas data**: All variations with images, prompts, and fine-tuning settings

The schema is designed for efficient querying by user and creation date. Connections are cached across serverless function invocations for performance.

### Component Architecture

The interface is built with a three-panel layout:

- **Left Panel**: Variations gallery showing all generated image variations
- **Center Panel**: Main canvas with zoom/pan controls and image display for the active variation
- **Right Panel**: Fine-tuning controls for brightness, contrast, and saturation
- **Bottom Panel**: AI command console for natural language editing

**Terminology Clarification:**
- **Canvas**: The editing interface/workspace (the stage where you work)
- **Variation**: Individual image versions that you create and switch between
- The canvas contains and displays variations, but variations are the actual content

**State Management:**
- Components follow React's Rules of Hooks - all hooks are called at the top level before any conditional logic or early returns
- State is managed through Zustand selectors to prevent unnecessary re-renders
- **Active Variation Handling**: The system gracefully handles null active variation states:
  - When no variation is selected: Shows "Select a variation" placeholder
  - When all variations are deleted: Maintains UI structure with disabled controls
  - When creating new variations: Immediately sets as active to prevent null states

**Variation Management:**
- **New Variation**: Creates blank variation with `status: 'blank'` and sets as active immediately
- **Duplicate Variation**: Creates copy of existing variation and sets as active
- **Delete Variation**: Handles active variation cleanup, selects next available or sets to null
- **Generation**: Updates status from 'blank' to 'generating' to 'completed' with proper state preservation

### Image Handling & Canvas Controls

Images are displayed with professional zoom and pan controls using react-zoom-pan-pinch. The system automatically fits images to the available space when first loaded, with manual zoom controls for detailed editing.

Fine-tuning adjustments (brightness, contrast, saturation) are applied using CSS filters, providing real-time preview without requiring server-side image processing.

### Ideal Image Generation Flow

The image generation process is designed to be asynchronous, using QStash for background processing. Generation is triggered in two specific scenarios:

1.  **Initial Canvas Creation**: When a user selects a creative idea for the first time.
2.  **Generative Edit**: When a user provides a new prompt via the AI Command Console in the canvas.

#### 1. Initial Canvas Generation

*   **Trigger**: User selects an idea in the `IdeationStage`.
*   **Frontend**: The `selectIdea` action in the Zustand store calls the `/api/services/clickatron/session/[id]/ideas/select` endpoint.
*   **Backend (`select/route.ts`)**:
    1.  Creates a new variation with `status: 'generating'`.
    2.  Creates a job in Redis via `createJob()`.
    3.  Enqueues the job with QStash, pointing to the `/api/internal/workers/clickatron/variation` worker.
    4.  The frontend receives the updated session state, showing the variation in a "generating" state.

#### 2. Generative Edit in Canvas

*   **Trigger**: User submits a prompt in the `AICommandConsole`.
*   **Frontend**: The `handleAIGenerate` function in `CanvasStage.tsx` calls the `/api/services/clickatron/session/[id]/variation` endpoint.
*   **Backend (`variation/route.ts`)**:
    1.  Creates a new variation with `status: 'generating'`.
    2.  Creates a job in Redis and enqueues it with QStash, pointing to the same worker.

#### 3. QStash Worker

*   **File**: `/api/internal/workers/clickatron/variation/route.ts`
*   **Behavior**: This endpoint is called by QStash to process the generation job.
*   **Implementation (Mock)**: For now, the worker will:
    1.  Receive the job payload (sessionId, variationId, prompt).
    2.  Wait for a few seconds to simulate processing.
    3.  Select a random mock image from a predefined list.
    4.  Update the `ClickatronTask` in MongoDB, setting the variation's `status` to `completed` and `imageRef` to the mock image URL.

#### 4. Frontend Updates

*   The frontend now polls the session endpoint every 2 seconds to check for updates after an idea is selected.
*   Once the job is done, the UI will automatically update the variation from "generating" to "completed" and display the new image.
*   Creating a new variation from the canvas UI (e.g., "New Variation" button) will create a variation with `status: 'blank'` and will NOT trigger any image generation.

### Aspect Ratio Handling

Blank canvases dynamically size themselves based on the selected aspect ratio and available screen space. The system calculates appropriate dimensions that fit within the interface while maintaining the correct proportions, with responsive updates on window resize.

### Error Handling

The system handles errors gracefully at multiple levels:

- **API failures**: Automatic rollback of optimistic updates with user notification
- **Validation errors**: Clear feedback on invalid input data
- **Network issues**: Retry mechanisms and offline state indicators
- **Authentication**: Proper handling of expired sessions and unauthorized access
- **State Conflicts**: Intelligent merging prevents data loss from concurrent updates
- **Null State Handling**: Graceful UI degradation when no variations are available

**Specific Conflict Resolution:**
- **Generation vs User Edits**: Backend generation status preserved while user fine-tuning changes are maintained
- **Concurrent Updates**: Post-sync state refresh ensures consistency across all clients
- **Variation Management**: Proper cleanup and state transitions prevent UI from getting stuck in loading states

Users always receive clear feedback about what went wrong and how to proceed.

### Performance Considerations

The system is optimized for smooth user experience:

- **Debounced updates**: Prevents excessive API calls during rapid user interactions
- **Memoized selectors**: Zustand selectors prevent unnecessary component re-renders
- **Event cleanup**: Proper cleanup of event listeners prevents memory leaks
- **Connection caching**: Database connections are reused across serverless invocations

### Testing Approach

The codebase supports testing at multiple levels:

- **Store testing**: Verify state management and optimistic updates work correctly
- **API testing**: Ensure endpoints handle requests and responses properly
- **Component testing**: Test user interactions and UI state changes
- **Integration testing**: Verify the complete workflow from idea to canvas

### Security

Security is enforced at multiple layers:

- **Authentication**: All API endpoints require valid user authentication through Clerk
- **Data validation**: Input validation using Zod schemas prevents malformed data
- **User isolation**: Database queries always filter by user ID to prevent data leakage
- **Session ownership**: Users can only access and modify their own creative sessions

### Environment Setup

The application requires:

- **MongoDB**: Database for storing creative sessions
- **Clerk**: Authentication service for user management
- **Next.js**: Framework with serverless API routes

Configuration is handled through environment variables for database connections, authentication keys, and application URLs.

## How It All Works Together

### User Flow

1. **Session Creation**: User enters video idea and aspect ratio, system generates creative concepts
2. **Idea Selection**: User chooses from AI-generated directions, triggering canvas initialization
3. **Canvas Editing**: User creates variations, applies fine-tuning, with automatic background saving
4. **Variation Management**: Users can create, duplicate, delete, and switch between image variations

### Data Flow

1. **Frontend**: User interactions update Zustand store immediately (optimistic updates)
2. **Background Sync**: Debounced API calls sync changes to MongoDB
3. **Error Recovery**: Failed syncs automatically revert UI to previous state
4. **State Hydration**: Page loads fetch latest data from database to initialize store

### Technical Stack Integration

- **Next.js**: Provides both frontend React components and serverless API routes
- **Zustand + Immer**: Manages complex nested state with immutable updates
- **MongoDB + Mongoose**: Stores session data with proper indexing and validation
- **Clerk**: Handles authentication and user management across all components

This architecture provides a responsive, reliable creative workspace that feels instant to users while maintaining data integrity through robust background synchronization.
