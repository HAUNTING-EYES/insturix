export type PublishStatusLoadState = 'loading' | 'ready' | 'error';

export type DeliveryQueueState = {
  status: string;
};

export type DeliveryConnectionHealth = {
  state: 'assigned' | 'attention' | 'reconnect';
};

export type DeliveryStateKind =
  | 'hidden'
  | 'loading'
  | 'unavailable'
  | 'published'
  | 'failed'
  | 'blocked'
  | 'pending'
  | 'claimed'
  | 'publishing'
  | 'unknown'
  | 'not_connected'
  | 'not_queued';

export function classifyDeliveryState(input: {
  approved: boolean;
  publishState?: DeliveryQueueState;
  connected?: boolean;
  connectionHealth?: DeliveryConnectionHealth;
  loadState: PublishStatusLoadState;
}): DeliveryStateKind {
  const { approved, publishState, connected, connectionHealth, loadState } = input;

  if (publishState?.status === 'published') return 'published';
  if (publishState?.status === 'failed') return 'failed';

  if (publishState) {
    if (connectionHealth && connectionHealth.state !== 'assigned') return 'blocked';
    if (connected === false) return 'blocked';
    if (publishState.status === 'pending') return 'pending';
    if (publishState.status === 'claimed') return 'claimed';
    if (publishState.status === 'publishing') return 'publishing';
    return 'unknown';
  }

  if (loadState === 'loading') return approved ? 'loading' : 'hidden';
  if (loadState === 'error') return approved ? 'unavailable' : 'hidden';
  if (connectionHealth && connectionHealth.state !== 'assigned') return approved ? 'blocked' : 'hidden';
  if (connected === false) return approved ? 'not_connected' : 'hidden';
  return approved ? 'not_queued' : 'hidden';
}
