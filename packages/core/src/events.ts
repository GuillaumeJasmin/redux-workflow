import { createAction } from '@reduxjs/toolkit';

/**
 * Global lifecycle signals that `setupListeners` dispatches and every api's
 * rootSaga watches. These are intentionally api-agnostic — one dispatch fans
 * out to every registered api's refetch runner.
 *
 * Dispatch these yourself if you're driving them from a source other than
 * `setupListeners` (e.g. a custom saga, a test, or a platform you don't want
 * to bridge).
 */
export const focusEvent = createAction('redux-workflow/focus');
export const focusLostEvent = createAction('redux-workflow/focusLost');
export const onlineEvent = createAction('redux-workflow/online');
export const offlineEvent = createAction('redux-workflow/offline');
