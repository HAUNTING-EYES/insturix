# Clickatron2: Frontend Refactoring & Standardization Guide

## Overview

This document outlines the refactoring plan for Clickatron2 to simplify the architecture and align with our core technology stack. The goal is to reduce complexity, eliminate custom solutions, and prepare for seamless backend integration.

## Current Assessment

The existing Clickatron2 implementation is technically impressive with excellent UI/UX. However, the custom storage architecture and state management patterns introduce complexity that could lead to maintainability issues. This refactoring focuses on standardization and simplification.

## Core Architectural Changes

### 1. State Management: Standardize on Zustand

**Current State:** Mix of React Hooks and custom state management
**Target:** Centralized Zustand store for all lab session state

**Implementation Plan:**
- Create `stores/useCanvasStore.ts` for all lab session state
- Migrate canvas/variations array, activeCanvasId, fine-tuning panel state
- Use selective subscriptions to prevent unnecessary re-renders
- Enable Redux DevTools for debugging

### 2. Client-Side Storage: Simplify to IndexedDB-First

**Current State:** Custom hybrid StorageManager with sessionStorage fallback
**Target:** Direct IndexedDB with Blob storage for images

**Implementation Plan:**
- Remove custom StorageManager and ImageCompressor
- Use `idb` library for simplified IndexedDB interactions
- Store images as Blobs (not Base64) for better quality and performance
- Zustand store holds only canvas IDs, components fetch Blobs as needed
- Periodic session state persistence to IndexedDB

### 3. Data Fetching: Prepare with TanStack Query

**Current State:** Mock implementations ready for fetch integration
**Target:** TanStack Query patterns established with mock data

**Implementation Plan:**
- Wrap app in QueryClientProvider
- Convert mock data functions to useQuery/useMutation patterns
- Implement debounced auto-save with useMutation
- Prepare for seamless backend integration

## Refactoring Steps

### Phase 1: Core Library Integration
1. Add dependencies: `zustand`, `@tanstack/react-query`, `idb`
2. Set up QueryClientProvider in app layout
3. Create base store structure

### Phase 2: State Management Migration
1. Create `stores/useCanvasStore.ts`
2. Migrate all lab session state
3. Update components to use Zustand selectors
4. Remove local state management

### Phase 3: Storage Refactoring
1. Create `lib/idb.ts` utilities
2. Remove StorageManager and ImageCompressor
3. Implement Blob-based image storage
4. Update image handling throughout components

### Phase 4: Data Flow Standardization
1. Convert mock functions to TanStack Query patterns
2. Implement auto-save with debounced mutations
3. Add proper loading and error states
4. Clean up unused utilities

## Benefits

- **Maintainability:** Standard patterns easier to debug and extend
- **Performance:** Blob storage preserves image quality, reduces memory usage
- **Developer Experience:** Redux DevTools, predictable state flow
- **Future-Proof:** Seamless backend integration path
- **Reliability:** Battle-tested libraries reduce custom code risks

## Success Metrics

- Reduced code complexity in storage layer
- Improved image quality and loading performance
- Easier debugging with Redux DevTools
- Faster development velocity for new features
- Smooth backend integration when ready

## Timeline

**Estimated Duration:** 2-3 days for complete refactoring
**Testing Phase:** 1 day for thorough validation
**Documentation:** Ongoing updates to reflect new patterns

This refactoring maintains all existing UI/UX while creating a more robust, maintainable foundation for future development.