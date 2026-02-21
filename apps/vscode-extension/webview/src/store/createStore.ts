import { useSyncExternalStore } from 'react';

type Listener = () => void;

type SetState<TState extends object> = (
    partial: Partial<TState> | ((state: TState) => Partial<TState>)
) => void;

type GetState<TState extends object> = () => TState;

export type StoreHook<TState extends object> = (() => TState) & {
    getState: GetState<TState>;
    setState: SetState<TState>;
    subscribe: (listener: Listener) => () => void;
};

export function create<TState extends object>(
    initializer: (set: SetState<TState>, get: GetState<TState>) => TState
): StoreHook<TState> {
    let state: TState;
    const listeners = new Set<Listener>();

    const getState: GetState<TState> = () => state;

    const setState: SetState<TState> = (partial) => {
        const patch = typeof partial === 'function' ? partial(state) : partial;
        state = { ...state, ...patch };
        for (const listener of listeners) listener();
    };

    const subscribe = (listener: Listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    };

    state = initializer(setState, getState);

    const useStore = (() => useSyncExternalStore(subscribe, getState, getState)) as StoreHook<TState>;
    useStore.getState = getState;
    useStore.setState = setState;
    useStore.subscribe = subscribe;

    return useStore;
}
