import "@testing-library/jest-dom";
import { configure } from "@testing-library/react";

// findBy*/waitFor give the UI up to 3 s (default 1 s) so a busy machine does not produce false failures.
configure({ asyncUtilTimeout: 3000 });

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Radix (Switch, Checkbox) measures elements with ResizeObserver, which jsdom does not provide.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
