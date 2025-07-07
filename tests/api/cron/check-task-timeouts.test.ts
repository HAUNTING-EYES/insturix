import { createMocks } from 'node-mocks-http';
import { GET } from '@/app/api/cron/check-task-timeouts/route';

describe('GET /api/cron/check-task-timeouts', () => {
  it('should return 401 Unauthorized if the cron secret is incorrect', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        authorization: 'Bearer wrongSecret',
      },
    });

    await GET(req as Request);
    expect(res._getStatusCode()).toBe(401);
    expect(res._getData()).toBe('Unauthorized');
  });

  it('should process tasks and return results if the cron secret is correct', async () => {
    process.env.CRON_SECRET = 'isCancelled';

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        authorization: 'Bearer isCancelled',
      },
    });

    await GET(req as Request);
    expect(res._getStatusCode()).toBe(200);

    const data = JSON.parse(res._getData());
    expect(data).toHaveProperty('processed');
    expect(data).toHaveProperty('errors');
    expect(data).toHaveProperty('details');
  });
});