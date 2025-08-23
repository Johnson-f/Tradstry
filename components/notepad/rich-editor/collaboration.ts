import {Provider} from '@lexical/yjs';
import {WebsocketProvider} from 'y-websocket';
import {Doc} from 'yjs';

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

const getWebsocketConfig = () => {
  if (!isBrowser) {
    return {
      endpoint: 'ws://localhost:1234',
      id: '0'
    };
  }
  
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  return {
    endpoint: params.get('collabEndpoint') || 'ws://localhost:1234',
    id: params.get('collabId') || '0'
  };
};

const config = getWebsocketConfig();
const WEBSOCKET_ENDPOINT = config.endpoint;
const WEBSOCKET_SLUG = 'playground';
const WEBSOCKET_ID = config.id;

// parent dom -> child doc
export function createWebsocketProvider(
  id: string,
  yjsDocMap: Map<string, Doc>,
): Provider {
  let doc = yjsDocMap.get(id);

  if (doc === undefined) {
    doc = new Doc();
    yjsDocMap.set(id, doc);
  } else {
    doc.load();
  }

  // @ts-expect-error
  return new WebsocketProvider(
    WEBSOCKET_ENDPOINT,
    WEBSOCKET_SLUG + '/' + WEBSOCKET_ID + '/' + id,
    doc,
    {
      connect: false,
    },
  );
}

/* Will remove collabarative feature in the future */