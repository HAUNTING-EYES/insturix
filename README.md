# INSTURIX: Platform Overview & Strategic Vision

INSTURIX is a Gen-AI-focused platform building an end-to-end ecosystem for the creator economy and B2B digital marketing teams. Currently operating on a pay-as-you-go credit system (deployed via Vercel), the platform allows users to manage the entire content lifecycle—from ideation to upload—under a single unified subscription. The ecosystem is currently composed of multiple functional web-based micro-services with foundational team collaboration features.

## 1. What INSTURIX is Right Now
INSTURIX provides an end-to-end ecosystem for the creator economy, allowing users to manage their content lifecycle from ideation to upload. The platform is powered by Gen-AI and operates on a unified credit-based service model.

## 2. Product Suite: Current State & Future Vision

### Editron (AI Video Editor & Agent)
* **Current State:** A web-based AI video editor powered by multi-modal LLMs. It can analyze audio and transcripts to cut, trim, split, and remove filler words automatically. It also features a unique internal code-generation engine to create accurate, scalable motion graphics and captions.
* **Vision:** To evolve into a General AI Video Agent. A user with zero technical knowledge will be able to upload raw footage and use natural language to command the AI to produce a complete, upload-ready video that perfectly aligns with their specific brand language.

### Alyzitron (AI Content Analyzer)
* **Current State:** A video analysis tool where users upload files or paste YouTube links. The AI scores the video across various dynamic metrics (out of 100), performs basic compliance checks, and suggests SEO titles and descriptions. It is currently adding a "chat-with-analysis" feature.
* **Vision:** To become a flawless omni-content analyzer (video, text, image). It will precisely pinpoint brand alignment, flag copyright risks, and run deep post-mortem analytics on published content to definitively answer *why* a piece of content succeeded or failed.

### Clickatron (AI Image Editor & Generator)
* **Current State:** An image generation and editing suite utilizing 3rd-party foundation models but enhanced with custom controls. Features include generative fill, sketch-to-edit, aspect ratio variations, and granular color grading/brightness controls within project folders.
* **Vision:** To be the ultimate balanced design tool offering both high-level autonomy and deep granular control. Future updates will include format auto-conversion (horizontal to vertical thumbnails) and a self-iterating AI loop that automatically reviews and corrects its own generations before presenting them to the user.

### ThinkForge (AI Ideation & Scripting)
* **Current State:** A text-based ideation tool (similar to ChatGPT) capable of web search, script generation, and Markdown-based editing.
* **Vision:** To transition from a generic text generator into a highly specialized brand architect. It will deeply understand a brand’s prior scripts, keywords, and style guidelines to generate perfectly tailored, highly specific content ideas and scripts.

### UploaderX (Multi-Platform Distribution)
* **Current State:** Currently in active development. The MVP is focused strictly on video distribution to Meta and YouTube.
* **Vision:** To be a universal content courier, allowing users to upload and schedule all formats of content (video, image, text) seamlessly across all major social media platforms at once.

### Musitron (AI Music Generator)
* **Current State:** A streamlined UI/UX API wrapper utilizing top open-source and closed-source music models (like Google's new model). Users input prompts and duration parameters to generate tracks.
* **Vision:** To provide an instant, frictionless way for creators to generate exact, mood-specific, no-copyright background music, bypassing traditional compliance and licensing hurdles.

### Socialize (Link-in-Bio Alternative)
* **Current State:** A streamlined link-tree alternative allowing users to add links, bios, time-limited messages, and customizable banner colors/images.
* **Vision:** To integrate AI customization, allowing the system to automatically generate, beautify, and update the UI based on the creator's latest content drops or aesthetic preferences.

## 3. The Long-Term Horizon: Universal Features & Ecosystem Orchestration

While individual services will continue to scale, the ultimate defensibility and value of INSTURIX lie in uniting these fragmented tools into a single, cohesive intelligence layer.

* **The Central Memory Layer (Brand Vault):** We are building a persistent, platform-wide memory system. This database will store and protect the user’s "Brand Language"—including tone, visual style, pacing preferences, and historical data. Every product in the INSTURIX suite will automatically query this vault, ensuring any script, video, or image generated is natively aligned with the user’s unique brand identity.
* **The Universal Agent:** INSTURIX will introduce a master orchestrator. Instead of manually clicking through different web apps, the user will interact with a single chat interface. This Universal Agent will have the autonomy to act on the user's behalf—calling Editron to cut a video, Clickatron to make the thumbnail, and UploaderX to post it—executing complex, multi-service workflows entirely through natural language commands.

- **Authentication**: Secure user authentication powered by Clerk
- **Payment System**: Multi-tier subscription management with Razorpay integration
- **Data Management**: Efficient data fetching and caching with React Query 5
- **Modern UI**: Beautiful responsive interface using Radix UI, Tailwind CSS 4 and Framer Motion
- **Real-time Updates**: Server-sent events (SSE) and webhook support with Svix
- **Analytics**: Integrated with Vercel Analytics and Speed Insights
- **Dark Mode**: Seamless theme switching with system preference detection
- **Type Safety**: Full TypeScript support throughout the application
- **SEO Optimization**: Structured data, meta tags, and optimized content
- **Accessibility**: WCAG 2.1 compliant components and navigation

## 🛠️ Tech Stack

- **Framework**: Next.js 15.3.0
- **UI Library**: React 19.1.0
- **Styling**: Tailwind CSS 4.1.3
- **State Management**: React Query 5.72.2
- **Authentication**: Clerk with custom UI integration
- **Database**: MongoDB (Mongoose)
- **Payment Processing**: Razorpay
- **Webhooks**: Svix for auth and service events
- **Type Safety**: TypeScript 5.7.2
- **UI Components**: Radix UI and Shadcn/UI
- **Form Handling**: React Hook Form with Zod validation
- **Animation**: Framer Motion
- **Icons**: Lucide React, Tabler Icons
- **Notifications**: React Hot Toast, Sonner
- **Markdown**: React Markdown
- **Syntax Highlighting**: React Syntax Highlighter
- **Real-time Communication**: Server-Sent Events (SSE)
- **Analytics**: Vercel Analytics, Speed Insights
- **SEO**: Next.js metadata API, structured data
- **Media Processing**: Cloud-based AI services

## 📦 Project Structure

```text
├── app/                         # Next.js app directory
│   ├── api/                     # API routes
│   │   ├── services/            # Service-specific APIs
│   │   │   ├── alyzitron/       # Alyzitron service APIs
│   │   │   │   ├── analyze/     # Content analysis endpoints
│   │   │   │   ├── callback/    # Service callbacks
│   │   │   │   ├── upload/      # Media upload endpoints
│   │   │   │   ├── utils/       # Service utilities  
│   │   │   │   └── types/       # Type definitions
│   │   │   └── ...              # Other services
│   │   ├── user/                # User management API
│   │   └── ...                  # Other API endpoints
│   ├── dashboard/               # Dashboard routes
│   │   ├── alyzitron/           # Alyzitron dashboard
│   │   ├── editron/             # Editron dashboard
│   │   └── ...                  # Other product dashboards
│   ├── products/                # Product landing pages
│   │   ├── alyzitron/           # Alyzitron product page
│   │   ├── editron/             # Editron product page
│   │   └── ...                  # Other product pages
│   ├── signin/                  # Authentication routes
│   ├── signup/                  # Registration routes
│   └── ...                      # Other app routes
├── components/                  # Reusable UI components
│   ├── ui/                      # Base UI components
│   ├── dashboard/               # Dashboard components
│   │   ├── Alyzitron/           # Alyzitron components
│   │   ├── Musitron/            # Musitron components
│   │   └── ...                  # Other product components
│   ├── new-product-page/        # Product page components
│   ├── upgrade-plan/            # Subscription components
│   └── data/                    # Static data components
├── hooks/                       # Custom React hooks
│   ├── use-toast.ts             # Toast notifications hook
│   ├── useSSEConnection.ts      # Server-sent events hook
│   ├── useVideoAnalysis.ts      # Video processing hook
│   └── ...                      # Other utility hooks
├── lib/                         # Utility functions
│   ├── services/                # Service utilities
│   ├── utils.ts                 # General utilities
│   ├── types.ts                 # Shared type definitions
│   └── seo/                     # SEO-related utilities
├── providers/                   # Context providers
├── public/                      # Static assets
└── schemas/                     # Database schemas
    ├── user.ts                  # User schema
    ├── apiUsage.ts              # API usage tracking
    └── ...                      # Other schemas
```

## 🔄 React Query Implementation

React Query is used throughout the application for efficient data fetching and caching. Key features include:

### Query Configuration

```typescript
// lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      retry: 3,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 2,
    },
  },
});
```

### Common Query Patterns

1 **Data Fetching with Error Handling**

```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['todos'],
  queryFn: async () => {
    try {
      const response = await fetch('/api/todos');
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    } catch (error) {
      throw new Error('Failed to fetch todos');
    }
  },
  onError: (error) => {
    toast.error(error.message);
  },
});
```

2 **Optimistic Updates**

```typescript
const mutation = useMutation({
  mutationFn: updateTodo,
  onMutate: async (newTodo) => {
    await queryClient.cancelQueries({ queryKey: ['todos'] });
    const previousTodos = queryClient.getQueryData(['todos']);
    queryClient.setQueryData(['todos'], (old) => [...old, newTodo]);
    return { previousTodos };
  },
  onError: (err, newTodo, context) => {
    queryClient.setQueryData(['todos'], context.previousTodos);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] });
  },
});
```

3 **Prefetching**

```typescript
const prefetchTodo = async (id: string) => {
  await queryClient.prefetchQuery({
    queryKey: ['todo', id],
    queryFn: () => fetchTodo(id),
  });
};
```

4 **Parallel Queries**

```typescript
const { data: user, isLoading: isLoadingUser } = useQuery({
  queryKey: ['user', userId],
  queryFn: () => fetchUser(userId),
});

const { data: posts, isLoading: isLoadingPosts } = useQuery({
  queryKey: ['posts', userId],
  queryFn: () => fetchPosts(userId),
  enabled: !!userId,
});
```

## 🚫 API Rate Limiting

The application implements rate limiting to prevent abuse and ensure fair usage. Rate limiting is configured at multiple levels:
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
        },
      }
    );
  }
  
  return NextResponse.next();
}
``

### 2. API Route Rate Limiting

```typescript
// lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const rateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '15 m'),
  analytics: true,
  prefix: 'rate-limit:',
});
```

## 🔐 Environment Variables

Create a `.env.local` file with the following variables:

```env
# Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key

# Database
MONGODB_URI=your_mongodb_uri

# Payment
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

# Rate Limiting
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token

# Analytics
NEXT_PUBLIC_ANALYTICS_ID=your_analytics_id

# Webhooks
WEBHOOK_SECRET=your_webhook_secret
```

## 🚀 Getting Started

1. **Install Dependencies**

```bash
pnpm install
```

2. **Set Up Environment Variables**

Use the provided `.env` file for local development. Ensure you update any relevant environment variables, especially those related to QStash.

3. **Run Development Server**

Run the following command to start the development server and QStash dev server:

```bash
# Start Next.js dev server
pnpm dev

# In a separate terminal, start QStash dev server
qstash dev
```

4 **Build for Production**

```bash
pnpm build
```

5 **Start Production Server**

```bash
pnpm start
```

## 📝 Development Guidelines

### Code Style

- Use TypeScript for all new files
- Follow the established project structure
- Use ESLint and Prettier for code formatting
- Write meaningful commit messages
- Follow the Git flow branching strategy

### Error Handling

- Implement proper error boundaries
- Use toast notifications for user feedback
- Log errors to a monitoring service
- Handle network errors gracefully
- Implement retry mechanisms for failed requests

### Testing

- Write unit tests for critical functionality
- Use React Testing Library for component tests
- Implement E2E tests for critical user flows
- Maintain good test coverage
- Run tests before committing

### Performance

- Implement proper caching strategies
- Use React Query's built-in caching
- Optimize images and assets
- Implement proper code splitting
- Use dynamic imports for large components
- Monitor performance metrics

### Security

- Implement proper authentication
- Use HTTPS in production
- Sanitize user input
- Implement CSRF protection
- Use secure headers
- Regular security audits

## 🔍 Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run E2E tests
pnpm test:e2e

# Run performance tests
pnpm test:performance
```

## 📈 Performance Optimization

### Caching Strategies

- Implement proper caching headers
- Use CDN for static assets
- Implement service workers
- Use browser caching
- Implement proper cache invalidation

### Code Splitting

- Use dynamic imports
- Implement route-based code splitting
- Split vendor chunks
- Use React.lazy for components
- Implement proper loading states

### Asset Optimization

- Optimize images
- Use modern image formats
- Implement responsive images
- Use font subsetting
- Implement proper asset caching

## 🚀 Deployment

### Vercel Deployment

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Configure environment variables
4. Deploy your application

### Docker Deployment

```bash
# Build the Docker image
docker build -t your-app-name .

# Run the container
docker run -p 3000:3000 your-app-name
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Pull Request Guidelines

- Provide a clear description of changes
- Include relevant tests
- Update documentation if needed
- Follow the code style guide
- Ensure all tests pass

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Next.js team for the amazing framework
- React Query team for the powerful data fetching library
- Clerk for the authentication solution
- All contributors and maintainers
