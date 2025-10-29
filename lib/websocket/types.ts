export type WebSocketConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export type WebSocketEventType =
  | 'stock:created'
  | 'stock:updated'
  | 'stock:deleted'
  | 'option:created'
  | 'option:updated'
  | 'option:deleted'
  | 'note:created'
  | 'note:updated'
  | 'note:deleted'
  | 'playbook:created'
  | 'playbook:updated'
  | 'playbook:deleted'
  | 'trade:tagged'
  | 'trade:untagged'
  | 'system:connected'
  | 'system:disconnected'
  | 'system:error';

export interface WebSocketEnvelope<TData = unknown> {
  event: WebSocketEventType;
  data: TData;
  timestamp: string;
}

export type WebSocketHandler<TData = unknown> = (data: TData) => void;


