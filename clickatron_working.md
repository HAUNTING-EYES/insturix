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

The API follows RESTful patterns with comprehensive endpoint coverage:

#### **Session Management**
- `POST /api/services/clickatron/session` - Create new creative session
- `GET /api/services/clickatron/session/:id` - Fetch session data
- `PATCH /api/services/clickatron/session/:id` - Sync canvas changes
- `POST /api/services/clickatron/session/:id/ideas/select` - Select creative direction
- `GET /api/services/clickatron/history` - Retrieve user's past sessions

#### **Variation Management**
- `POST /api/services/clickatron/session/:id/variation` - Create/generate new variation
- `GET /api/services/clickatron/session/:id/variation/:varId` - Get single variation
- `PATCH /api/services/clickatron/session/:id/variation/:varId` - Update variation

#### **Chat & Messages**
- `POST /api/services/clickatron/session/:id/chat` - Add chat message
- `GET /api/services/clickatron/session/:id/chat` - Get chat history

#### **Features**
- **Idempotency**: All mutation endpoints support `Idempotency-Key` headers
- **Validation**: Comprehensive Zod schemas for all request/response types
- **Authentication**: Clerk-based user authentication with proper isolation
- **Error Handling**: Consistent HTTP status codes and error messages

All requests are validated using Zod schemas to ensure data integrity. Authentication is handled through Clerk, with user isolation enforced at the database level.

### Database Design

Clickatron uses MongoDB with a single collection for all creative sessions. Each document contains:

- **User identification**: Links sessions to specific users
- **Session metadata**: Video idea, aspect ratio, creation timestamps
- **Creative workflow**: Generated ideas and user selections
- **Canvas data**: All variations with images, prompts, fine-tuning settings, and chat history

The schema is designed for efficient querying by user and creation date. Connections are cached across serverless function invocations for performance.

### Component Architecture

The interface is built with a three-panel layout:

- **Left Panel**: Variations gallery showing all generated image variations
- **Center Panel**: Main canvas with zoom/pan controls and image display for the active variation
- **Right Panel**: Fine-tuning controls for brightness, contrast, and saturation
- **Bottom Panel**: AI command console for natural language editing with chat history

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
- **Generation**: Updates status from 'blank' to 'generating' to 'completed/failed' with proper state preservation

### Image Handling & Canvas Controls

Images are displayed with professional zoom and pan controls using react-zoom-pan-pinch. The system automatically fits images to the available space when first loaded, with manual zoom controls for detailed editing.

Fine-tuning adjustments (brightness, contrast, saturation) are applied using CSS filters, providing real-time preview without requiring server-side image processing.

### Complete Image Generation Flow

The image generation process is designed to be asynchronous, using QStash for background processing. Generation is triggered in two specific scenarios:

1. **Initial Canvas Creation**: When a user selects a creative idea for the first time.
2. **Generative Edit**: When a user provides a new prompt via the AI Command Console in the canvas.

#### 1. Initial Canvas Generation

- **Trigger**: User selects an idea in the `IdeationStage`.
- **Frontend**: The `selectIdea` action in the Zustand store calls the `/api/services/clickatron/session/[id]/ideas/select` endpoint.
- **Backend (`select/route.ts`)**:
  1. Creates a new variation with `status: 'generating'`, complete timestamps, and required fields.
  2. Initializes canvas with empty chat history.
  3. Creates a job in Redis via `createJob()`.
  4. Enqueues the job with QStash, pointing to the `/api/internal/workers/clickatron/variation` worker.
  5. The frontend receives the updated session state, showing the variation in a "generating" state.

#### 2. Generative Edit in Canvas

- **Trigger**: User submits a prompt in the `AICommandConsole`.
- **Frontend**: The `handleAIGenerate` function in `CanvasStage.tsx` calls the `/api/services/clickatron/session/[id]/variation` endpoint.
- **Backend (`variation/route.ts`)**:
  1. Creates a new variation with `status: 'generating'`, timestamps, and parent variation context.
  2. Automatically saves the user prompt as a chat message with reference images.
  3. Creates a job in Redis and enqueues it with QStash, pointing to the same worker.

#### 3. QStash Worker

- **File**: `/api/internal/workers/clickatron/variation/route.ts`
- **Behavior**: This endpoint is called by QStash to process the generation job.
- **Implementation**: 
  1. Validates job ownership (`job.userId === task.clerkUserId`)
  2. Simulates processing with 10% failure rate for testing
  3. Updates variation status to `completed` or `failed`
  4. Sets `updatedAt` timestamp and mock image URL (for successful generations)
  5. Completes or fails the job in Redis

#### 4. Frontend Updates

- The frontend uses consistent polling utilities for both idea selection and generative edits
- `pollVariationCompletion()` utility handles polling logic with proper cleanup
- Once generation is complete, the UI automatically updates the variation status and displays the result
- Failed variations show retry buttons with graceful error handling

### ✅ **Completed Implementation (December 2024)**

All previously identified gaps have been resolved:

#### **✅ Fixed State Management Issues**
- **No More Duplication**: Removed local variation insertion in `handleAIGenerate`
- **Server Reconciliation**: Now calls `loadSession()` after server response to get authoritative state
- **Consistent Polling**: Unified polling utility for both idea selection and generative edits
- **Idempotency**: Client generates and sends `Idempotency-Key` headers to prevent duplicate requests

#### **✅ Enhanced Variation Management**
- **Parent Variation Support**: Added `parentVariationId` field for edit context tracking
- **Timestamps**: All variations have required `createdAt` and `updatedAt` fields
- **Individual Endpoints**: `GET/PATCH /session/:id/variation/:varId` for single variation access
- **Failed State Handling**: UI shows retry buttons for failed generations with 10% mock failure rate

#### **✅ Chat & Message Persistence**
- **Chat Endpoints**: `POST/GET /api/services/clickatron/session/:id/chat` for message management
- **Auto-save Messages**: Variation generation automatically saves prompts as chat messages
- **Chat History UI**: Integrated chat history display in AI Command Console
- **Reference Images**: Full support for reference image persistence in chat

#### **✅ Robust Error Handling**
- **Job Ownership**: Worker validates `job.userId === task.clerkUserId` before processing
- **Failure Recovery**: Graceful error states with retry functionality
- **State Consistency**: Intelligent merging preserves user edits while respecting backend updates
- **Null State Handling**: Proper UI degradation for edge cases

#### **✅ Production-Ready Architecture**
- **Complete Schema**: All new fields are required (no backwards compatibility needed)
- **Type Safety**: Comprehensive Zod validation for all endpoints
- **Security**: Proper authentication and user isolation throughout
- **Testing**: Integration test suite covering all new functionality
- **✅ Real AI Image Generation**: Integrated Fal AI's Flux model with Google Cloud Storage

### **Current Worker Behavior**
- **Real AI Generation**: Worker now uses Fal AI's Flux model for image generation
- **GCS Storage**: Generated images are stored in Google Cloud Storage
- **Production Ready**: Fully functional real AI generation service

### **Next Steps for Real Image Generation**
1. ✅ Configure Fal AI API key in environment variables
2. ✅ Set up Google Cloud Storage bucket
3. ✅ All state management and error handling is already production-ready

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
- **Job ownership**: Worker validates job ownership before processing

### Environment Setup

The application requires:

- **MongoDB**: Database for storing creative sessions
- **Redis (Upstash)**: Job queue and caching
- **QStash**: Background job processing
- **Clerk**: Authentication service for user management
- **Next.js**: Framework with serverless API routes

Configuration is handled through environment variables for database connections, authentication keys, and application URLs.

## How It All Works Together

### User Flow

1. **Session Creation**: User enters video idea and aspect ratio, system generates creative concepts
2. **Idea Selection**: User chooses from AI-generated directions, triggering canvas initialization
3. **Canvas Editing**: User creates variations, applies fine-tuning, with automatic background saving
4. **Variation Management**: Users can create, duplicate, delete, and switch between image variations
5. **Chat History**: Complete conversation tracking with reference image support

### Data Flow

1. **Frontend**: User interactions update Zustand store immediately (optimistic updates)
2. **Background Sync**: Debounced API calls sync changes to MongoDB
3. **Error Recovery**: Failed syncs automatically revert UI to previous state
4. **State Hydration**: Page loads fetch latest data from database to initialize store

### Technical Stack Integration

- **Next.js**: Provides both frontend React components and serverless API routes
- **Zustand + Immer**: Manages complex nested state with immutable updates
- **MongoDB + Mongoose**: Stores session data with proper indexing and validation
- **Redis + QStash**: Handles background job processing and caching
- **Clerk**: Handles authentication and user management across all components

### Known Issues and Limitations

1.  **Model Selection Logic**: The logic for selecting between text-to-image and image-to-image models based on the presence of reference images is not fully implemented. Currently, the system may not correctly switch models when a reference image is added or removed. Key files to examine: `lib/config/clickatron-models.ts`, `app/api/internal/workers/clickatron/variation/route.ts`.
2.  **Payload Construction**: The current implementation for constructing API payloads for different AI models is complex and relies on numerous conditional checks. This makes it difficult to add new models or modify existing ones. Key files to examine: `app/api/internal/workers/clickatron/variation/route.ts`.
3.  **Ideation Stage Model Filtering**: In the initial ideation stage, when no reference images are provided, the system should only show text-to-image models. However, image-to-image models like `flux-kontext/dev` are currently available for selection. Key files to examine: `components/dashboard/Clickatron/stages/ModelSelector.tsx`, `lib/config/clickatron-models.ts`.
4.  **Model Selector Dropdown**: The model selector dropdown in the ideation stage may not be functioning correctly. User selections might not be properly propagated, causing the system to default to `flux-kontext/dev`. Key files to examine: `components/dashboard/Clickatron/stages/IdeationStage.tsx`, `components/dashboard/Clickatron/ClickatronLabClient.tsx`, `stores/useCanvasStore.ts`.
5.  **Model Configuration**: The configuration for different AI models is not intuitive. Adding a new model with its specific API requirements should be simpler. Key files to examine: `lib/config/clickatron-models.ts`.

This architecture provides a responsive, reliable creative workspace that feels instant to users while maintaining data integrity through robust background synchronization and comprehensive error handling.