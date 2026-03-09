/**
 * Storybook utility functions for mocking callbacks.
 * In Storybook 10, @storybook/test is not available, so we provide our own mock function.
 */

export function fn<T extends (...args: unknown[]) => unknown>(
  implementation?: T,
): T & { mockImplementation: (impl: T) => T } {
  const mockFn = ((...args: Parameters<T>) => {
    if (implementation) {
      return implementation(...args);
    }
    return undefined;
  }) as T & { mockImplementation: (impl: T) => T };

  mockFn.mockImplementation = (impl: T) => {
    return fn(impl) as T & { mockImplementation: (impl: T) => T };
  };

  return mockFn;
}
