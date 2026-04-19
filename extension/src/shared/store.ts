/**
 * Simple reactive store for state management.
 * Replaces the global variable soup from v1.
 */

export type Listener<T> = (state: T, prevState: T) => void;

export class Store<T extends object> {
  private state: T;
  private listeners: Set<Listener<T>> = new Set();

  constructor(initialState: T) {
    this.state = initialState;
  }

  getState(): Readonly<T> {
    return this.state;
  }

  setState(partial: Partial<T>): void {
    const prevState = this.state;
    this.state = { ...this.state, ...partial };
    this.notify(prevState);
  }

  /**
   * Update nested state with a path.
   * Example: store.setPath('brush.color', '#ff0000')
   */
  setPath<K extends keyof T>(key: K, value: T[K]): void {
    this.setState({ [key]: value } as Partial<T>);
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Subscribe to changes on a specific key.
   */
  subscribeKey<K extends keyof T>(
    key: K,
    listener: (value: T[K], prevValue: T[K]) => void
  ): () => void {
    return this.subscribe((state, prevState) => {
      if (state[key] !== prevState[key]) {
        listener(state[key], prevState[key]);
      }
    });
  }

  private notify(prevState: T): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.state, prevState);
      } catch (err) {
        console.error('[Store] Listener error:', err);
      }
    });
  }
}

/**
 * Create a derived/computed value that updates when dependencies change.
 */
export function derived<T extends object, R>(
  store: Store<T>,
  selector: (state: T) => R,
  onChange: (value: R) => void
): () => void {
  let currentValue = selector(store.getState());

  return store.subscribe((state) => {
    const newValue = selector(state);
    if (newValue !== currentValue) {
      currentValue = newValue;
      onChange(newValue);
    }
  });
}
