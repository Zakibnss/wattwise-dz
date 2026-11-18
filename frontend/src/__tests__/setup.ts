declare function afterEach(fn: () => void | Promise<void>): void;
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

afterEach(() => {
  cleanup();
});
