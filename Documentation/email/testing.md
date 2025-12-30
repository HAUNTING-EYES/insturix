# Transactional Mailer Testing

The mailing system is validated with lightweight Node tests that run without contacting AWS. Tests live in `lib/services/email/__tests__/` and use the built-in `node:test` runner so no additional dependencies are required.

## Running Tests

```bash
pnpm test:email
```

The command uses the `tsx` runner to compile TypeScript tests on the fly and executes two suites:

1. **`mailer.test.ts`** – exercises the `TransactionalMailer` using an in-memory provider to verify template rendering, batch handling, and configuration delegation.
2. **`templates.test.ts`** – verifies template ids and ensures HTML/text variants are produced.

## Writing Additional Tests

- Prefer in-memory providers that implement the `MailProvider` interface to avoid network calls.
- Assert on the `MailMessage` payload captured by the provider to guarantee template subjects, HTML, and text copy remain correct.
- When adding a new template, create a focused test that calls `renderTemplate('<template-id>', payload)` and checks for key strings or links.

## Manual Verification

Even with automated tests, send a manual email whenever you ship template changes:

```bash
curl -X POST http://localhost:3000/api/email/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-email@example.com",
    "subject": "Manual test",
    "htmlBody": "<h1>Manual test</h1>"
  }'
```

This confirms SES credentials and network configuration are correct in the current environment.
