import type { Dispatch } from '@reduxjs/toolkit';
import { focusEvent, focusLostEvent, onlineEvent, offlineEvent } from './events';

export type SetupListenersHandlers = {
  onFocus: () => void;
  onFocusLost: () => void;
  onOnline: () => void;
  onOffline: () => void;
};

export type SetupListenersPlatformWiring = (
  dispatch: Dispatch,
  handlers: SetupListenersHandlers,
) => () => void;

/**
 * Default browser wiring — subscribes to `window.focus`/`window.blur` and
 * `window.online`/`window.offline`. Returns a cleanup function.
 */
function defaultBrowserWiring(
  _dispatch: Dispatch,
  { onFocus, onFocusLost, onOnline, onOffline }: SetupListenersHandlers,
): () => void {
  if (typeof window === 'undefined') {
    return () => {
      /* no-op on non-browser platforms */
    };
  }

  window.addEventListener('focus', onFocus);
  window.addEventListener('blur', onFocusLost);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  return () => {
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('blur', onFocusLost);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}

/**
 * Wire platform focus / online signals into redux-workflow's refetch pipeline.
 *
 * Browser default:
 *
 * ```ts
 * const cleanup = setupListeners(store.dispatch);
 * ```
 *
 * React Native (supply your own platform wiring):
 *
 * ```ts
 * setupListeners(store.dispatch, (dispatch, { onFocus, onFocusLost, onOnline, onOffline }) => {
 *   const appState = AppState.addEventListener('change', (state) => {
 *     state === 'active' ? onFocus() : onFocusLost();
 *   });
 *   const unsubNet = NetInfo.addEventListener((s) =>
 *     s.isConnected ? onOnline() : onOffline(),
 *   );
 *   return () => {
 *     appState.remove();
 *     unsubNet();
 *   };
 * });
 * ```
 *
 * The handlers passed to the custom wiring dispatch `focusEvent` / `onlineEvent`
 * / ... on the store. Every api's rootSaga picks those up and refetches the
 * subscribed entries marked with `refetchOnFocus` / `refetchOnReconnect`.
 */
export function setupListeners(
  dispatch: Dispatch,
  platformWiring: SetupListenersPlatformWiring = defaultBrowserWiring,
): () => void {
  const handlers: SetupListenersHandlers = {
    onFocus: () => dispatch(focusEvent()),
    onFocusLost: () => dispatch(focusLostEvent()),
    onOnline: () => dispatch(onlineEvent()),
    onOffline: () => dispatch(offlineEvent()),
  };

  return platformWiring(dispatch, handlers);
}
