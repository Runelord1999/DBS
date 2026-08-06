/**
 * The `@demo` module in a normal build.
 *
 * The application imports the demo bridge unconditionally; the Vite config
 * decides what that resolves to. In the standard build it is this file, so the
 * server route modules, the Express shim and the SQLite wasm runtime are never
 * pulled into the bundle that talks to the real API.
 */

const unavailable = () => {
  throw new Error('The in-browser demo API is not part of this build.');
};

export const startDemoServer = unavailable;
export const demoRequest = unavailable;
export const setPersona = unavailable;
export const getPersonas = () => [];
export const getCurrentPersona = () => null;
