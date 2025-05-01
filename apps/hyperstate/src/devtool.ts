import type {} from "@redux-devtools/extension";
import { fnNameContext, sliceNameContext, type StoreApi } from "./state";

// DevTools configuration type
type Config = Parameters<
  (Window extends { __REDUX_DEVTOOLS_EXTENSION__?: infer T }
    ? T
    : { connect: (param: unknown) => unknown })["connect"]
>[0];

// Message type for DevTools communication
type Message = {
  type: string;
  payload?: {
    type: string;
    [key: string]: unknown;
  };
  state?: string;
};

// Type for action with custom properties
type DevtoolsAction = {
  type: string;
  [key: string]: unknown;
};

// DevTools options interface
export interface DevtoolsOptions extends Config {
  name?: string;
  enabled?: boolean;
}

/**
 * Connect a store to Redux DevTools
 */
export function connectToDevTools<T>(
  store: StoreApi<T>,
  options: DevtoolsOptions = {},
): () => void {
  const { enabled, ...connectOptions } = options;

  // Try to connect to Redux DevTools
  let extensionConnector: typeof window.__REDUX_DEVTOOLS_EXTENSION__ | false;

  try {
    // In development mode by default (simplified check)
    const isDevelopment = import.meta?.env?.MODE !== "production";

    extensionConnector =
      (enabled ?? isDevelopment) && window.__REDUX_DEVTOOLS_EXTENSION__;
  } catch {
    // Ignore errors (e.g., when window is not defined)
    return () => {}; // Return no-op cleanup function
  }

  // If the extension is not available, return no-op cleanup function
  if (!extensionConnector) {
    return () => {};
  }

  // Connect to DevTools
  const connection = extensionConnector.connect({
    name: options.name || "Hyperstate Store",
    ...connectOptions,
  });

  // Initialize DevTools with current state
  connection.init(store.getState());

  let isRecording = true;

  // Subscribe to store changes
  const unsubscribe = store.subscribe((store, state, _prevState, patches) => {
    if (!isRecording) return;

    // Send state update with custom action format
    const action: DevtoolsAction = {
      type: `${store.getContextValue(sliceNameContext)}/${store.getContextValue(fnNameContext)}`,
      // Include patches as custom properties
      patchInfo: {
        patches,
      },
    };

    connection.send(action, state);
  });

  // Subscribe to DevTools messages
  const unsubscribeFromDevtools = (
    connection as unknown as {
      subscribe: (
        listener: (message: Message) => void,
      ) => (() => void) | undefined;
    }
  ).subscribe((message: Message) => {
    switch (message.type) {
      case "DISPATCH":
        switch (message.payload?.type) {
          case "RESET":
            isRecording = false;
            store.____setState(store.getInitialState(), [], []);
            isRecording = true;
            connection.init(store.getState());
            break;

          case "COMMIT":
            connection.init(store.getState());
            break;

          case "ROLLBACK":
            if (message.state) {
              try {
                isRecording = false;
                store.____setState(JSON.parse(message.state), [], []);
                isRecording = true;
                connection.init(store.getState());
              } catch (e) {
                console.error("[hyperstate/devtools] Failed to parse state", e);
              }
            }
            break;

          case "JUMP_TO_STATE":
          case "JUMP_TO_ACTION":
            if (message.state) {
              try {
                isRecording = false;
                store.____setState(JSON.parse(message.state), [], []);
                isRecording = true;
              } catch (e) {
                console.error("[hyperstate/devtools] Failed to parse state", e);
              }
            }
            break;

          case "PAUSE_RECORDING":
            isRecording = !isRecording;
            break;

          default:
            break;
        }
        break;

      default:
        break;
    }
  });

  // Return cleanup function
  return () => {
    unsubscribe();
    if (unsubscribeFromDevtools) {
      unsubscribeFromDevtools();
    }
  };
}
