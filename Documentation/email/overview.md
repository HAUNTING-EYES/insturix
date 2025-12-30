# Transactional Mailer Overview

The frontend now ships with a reusable transactional mailing system located in `lib/services/email`. The system is built around a provider interface (`MailProvider`) and a template registry that keeps HTML generation separate from delivery concerns.

## Components

- **TransactionalMailer**: High-level class responsible for turning template payloads into deliverable messages and delegating to a provider instance.
- **SESProvider**: Default implementation that sends messages through AWS Simple Email Service (SES). Automatic rate limiting and retry logic are embedded.
- **Template Registry**: Every template lives in the `templates/` directory as its own file. The registry exports typed payload contracts and render helpers.
- **Helpers**: Thin wrappers (`sendWelcomeEmail`, `sendNotificationEmail`, etc.) that obtain the default mailer and invoke the right template for common scenarios.

## Adding a Template

1. Create a new file in `lib/services/email/templates/` that exports a `TemplateDefinition` with a unique id.
2. Register the template in `templates/index.ts` and add the payload type to `TemplatePayloads`.
3. (Optional) Add a convenience helper in `helpers.ts`.

## Instantiating the Mailer

```typescript
import { createMailer } from '@/lib/services/email';

const mailer = createMailer();
await mailer.send({
  to: 'billing@example.com',
  subject: 'Invoice ready',
  htmlBody: '<p>Your invoice is attached.</p>',
});
```

Use `createMailer()` when you need a scoped instance (for testing or dependency injection). For application-wide usage, prefer the exported helper functions which reuse a shared singleton.

## Operational Checks

- Run `pnpm test:email` before deploying changes to templates or providers.
- Ensure AWS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SES_REGION`, `AWS_SES_FROM_EMAIL`) are set in every environment. Missing credentials or from address will cause start-up failures, preventing silent misconfiguration.
- Monitor SES sending quotas and error rates through CloudWatch. The provider logs retries and exponential backoff metrics to help diagnose throttling events.
