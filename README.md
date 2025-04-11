# Modern Web Application

A full-stack web application built with Next.js, React, and TypeScript, featuring modern UI components and robust data management using MongoDB.

## 🚀 Features

- **Authentication**: Secure user authentication powered by Clerk
- **Data Management**: Efficient data fetching and caching with React Query
- **Modern UI**: Beautiful and responsive interface using Radix UI and Tailwind CSS
- **Type Safety**: Full TypeScript support
- **API Rate Limiting**: Implemented to prevent abuse and ensure fair usage
- **Real-time Updates**: Webhook support with Svix
- **Payment Integration**: Razorpay integration for secure transactions
- **Analytics**: Vercel Analytics and Speed Insights for performance monitoring
- **Internationalization**: Multi-language support
- **Dark Mode**: Theme switching capability
- **Responsive Design**: Mobile-first approach
- **SEO Optimization**: Built-in SEO features
- **Accessibility**: WCAG 2.1 compliant

## 🛠️ Tech Stack

- **Framework**: Next.js 15.3.0
- **UI Library**: React 19.1.0
- **Styling**: Tailwind CSS 4.1.3
- **State Management**: React Query 5.72.2
- **Authentication**: Clerk
- **Database**: MongoDB (Mongoose)
- **Payment Processing**: Razorpay
- **Webhooks**: Svix
- **Type Safety**: TypeScript 5.7.2
- **UI Components**: Radix UI
- **Form Handling**: Formik + Yup
- **Animation**: Framer Motion
- **Icons**: Lucide React, Tabler Icons
- **Notifications**: React Hot Toast, Sonner
- **Markdown**: React Markdown
- **Syntax Highlighting**: React Syntax Highlighter

## 📦 Project Structure

```text
├── app/              # Next.js app directory
│   ├── api/         # API routes
│   ├── (auth)/      # Authentication routes
│   ├── (dashboard)/ # Dashboard routes
│   └── (marketing)/ # Marketing pages
├── components/       # Reusable UI components
│   ├── ui/          # Base UI components
│   ├── forms/       # Form components
│   └── layout/      # Layout components
├── hooks/           # Custom React hooks
├── lib/             # Utility functions and configurations
│   ├── db/          # Database utilities
│   ├── api/         # API utilities
│   └── utils/       # Helper functions
├── providers/       # Context providers
├── public/          # Static assets
└── schemas/         # Data validation schemas
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

### 1. Edge Rate Limiting

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'),
  analytics: true,
});

export const config = {
  matcher: '/api/:path*',
};

export default async function middleware(request: NextRequest) {
  const ip = request.ip ?? '127.0.0.1';
  const { success, pending, limit, reset, remaining } = await ratelimit.limit(ip);
  
  if (!success) {
    return new Response(
      JSON.stringify({
        error: 'Too Many Requests',
        reset: reset,
        remaining: remaining,
      }),
      {
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
```

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
yarn install
```

2 **Set Up Environment Variables**

```bash
cp .env.example .env.local
# Edit .env.local with your credentials
```

3 **Run Development Server**

```bash
yarn dev
```

4 **Build for Production**

```bash
yarn build
```

5 **Start Production Server**

```bash
yarn start
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
yarn test

# Run tests in watch mode
yarn test:watch

# Run E2E tests
yarn test:e2e

# Run performance tests
yarn test:performance
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
