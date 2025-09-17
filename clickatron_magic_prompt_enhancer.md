# Clickatron: Magic Prompt Enhancer Feature Implementation

## Overview

This document outlines the implementation plan for adding a "Magic Prompt Enhancer" feature to the Clickatron application. This feature will allow users to enhance their prompts using an AI model before generating images.

## Feature Requirements

1. A single toggle button labeled "Magic Prompt Enhancer" should be available in the following locations:
    - `/dashboard/clickatron` in `components/dashboard/Clickatron/CanvasIdeaInput.tsx`
    - `components/dashboard/Clickatron/canvas/AICommandConsole.tsx`
    - `components/dashboard/Clickatron/canvas/NewVariationConsole.tsx`
2. When clicked, the button should:
    - Temporarily disable the input field and the "Start Generating" (or submit) button.
    - Change its icon to a loading spinner.
    - Send the current user's prompt to a new backend endpoint.
3. The backend endpoint should:
    - Receive the user's prompt.
    - Send the prompt to an LLM (specifically "gemini-2.0-flash" through the Vercel AI SDK with structured output).
    - Return the enhanced prompt to the frontend.
4. The frontend should then:
    - Replace the original prompt in the input field with the enhanced prompt returned by the backend.
    - Re-enable the input field and the "Start Generating" (or submit) button.
5. Rate limiting should be implemented for this feature (and potentially other similar features) in a standard way across the project.

## Implementation Progress

### 1. Backend Implementation

#### 1.1. Create API Endpoint

- **Location**: `app/api/services/clickatron/enhance-prompt/route.ts`
- **Method**: `POST`
- **Request Body**:
  - `prompt` (string): The user's original prompt.
- **Response**:
  - `enhancedPrompt` (string): The AI-enhanced version of the prompt.
- **Authentication**: This endpoint should be protected with Clerk authentication, similar to other Clickatron endpoints.
- **Rate Limiting**: Implement rate limiting using Upstash or a similar service. This should be configurable and potentially shared with other AI-enhancement features.
- **Logic**:
  1. Validate the incoming request and extract the `prompt`.
  2. Call the "gemini-2.0-flash" model through the Vercel AI SDK with structured output to enhance the prompt for image generation.
  3. Return the enhanced prompt in the response.
- **Status**: Created the API endpoint with proper model instantiation using the Google Generative AI provider.

### 2. Frontend Implementation

#### 2.1. Create Reusable Button Component

- **Location**: `components/dashboard/Clickatron/MagicPromptEnhancerButton.tsx`
- **Props**:
  - `onEnhance` (function): An async function that takes the current prompt and returns the enhanced prompt. This function will handle the API call to the backend.
  - `isEnhancing` (boolean): Indicates whether the enhancement process is currently running.
  - `disabled` (boolean): Whether the button should be disabled.
- **Functionality**:
  - Display a "Magic" icon when not active.
  - Display a loading spinner when `isEnhancing` is true.
  - Call `onEnhance` when clicked.
  - Handle potential errors from the `onEnhance` function (e.g., display a toast notification).
- **Status**: Created the reusable button component.

#### 2.2. Integrate Button into `CanvasIdeaInput.tsx`

- Add the `MagicPromptEnhancerButton` component to the UI, likely next to the "Start Generating" button.
- Manage the `isEnhancing` state within `CanvasIdeaInput.tsx`.
- Implement the `onEnhance` function to:
  1. Set `isEnhancing` to `true`.
  2. Disable the main prompt input and "Start Generating" button.
  3. Call the new `/api/services/clickatron/enhance-prompt` endpoint with the current `prompt` state.
  4. On success, update the `prompt` state with the enhanced prompt.
  5. On error, display an appropriate message to the user.
  6. Set `isEnhancing` to `false` and re-enable the input and button.
- **Status**: Integrated the button into the component with all required functionality.

#### 2.3. Integrate Button into `AICommandConsole.tsx`

- Add the `MagicPromptEnhancerButton` component to the UI, likely next to the send button.
- Manage the `isEnhancing` state within `AICommandConsole.tsx`.
- Implement the `onEnhance` function similarly to `CanvasIdeaInput.tsx`, but updating the `prompt` state local to the console component.
- **Status**: Integrated the button into the component with all required functionality.

#### 2.4. Integrate Button into `NewVariationConsole.tsx`

- Add the `MagicPromptEnhancerButton` component to the UI, likely next to the send button.
- Manage the `isEnhancing` state within `NewVariationConsole.tsx`.
- Implement the `onEnhance` function similarly to `CanvasIdeaInput.tsx`, but updating the `prompt` state local to the console component.
- **Status**: Integrated the button into the component with all required functionality.

### 3. Rate Limiting Implementation

- **Location**: The rate limiting logic should be implemented as middleware or within the new API route itself.
- **Configuration**: Define rate limits in `lib/config/serviceLimits.ts` or a similar configuration file.
- **Standardization**: Ensure the rate limiting approach is consistent with other rate-limited features in the application (e.g., Musitron, Thinkforge).
- **Feedback**: Provide clear feedback to the user if they exceed the rate limit (e.g., a toast notification indicating they need to wait).
- **Status**: Added configuration for prompt enhancements to service limits. Will implement later when service limits are fully integrated into Clickatron.

## Future Considerations

- **LLM Provider Abstraction**: Consider creating an abstraction layer for the LLM provider to allow for easy switching between providers.
- **Prompt Enhancement Options**: In the future, we might want to offer different types of prompt enhancement (e.g., "Make it more detailed", "Make it more creative").
- **Analytics**: Track usage of the prompt enhancer feature to understand its adoption and effectiveness.

## Current Issues

None at the moment.

## Next Steps

1. Test the complete feature flow.
    - Verify that the button works correctly in all three locations.
    - Ensure the API endpoint returns properly enhanced prompts.
    - Confirm error handling works as expected.
2. Document any additional findings or changes.
    - Update this document with the final implementation details.
    - Note any deviations from the original plan.
3. Update the todo list to reflect completed tasks.
