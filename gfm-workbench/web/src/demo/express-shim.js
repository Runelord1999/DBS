/**
 * A minimal Express-compatible router, for the static demo build only.
 *
 * The published demo has no server, but the point of it is to show the *real*
 * tool — so rather than reimplementing the API in the browser, the demo build
 * aliases `express` to this shim and runs `server/src/routes/*.js` verbatim.
 * Same handlers, same validation, same RBAC, same capacity maths.
 *
 * It implements only the surface those routes actually use. Anything outside
 * that throws rather than quietly doing nothing, so a route that grows a new
 * dependency fails loudly instead of misbehaving in front of an audience.
 */

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** Compiles "/:id/milestones/:milestoneId" into an anchored, per-segment matcher. */
function compilePath(path) {
  const names = [];
  const pattern = String(path)
    .replace(/\/$/, '')
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) {
        return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      names.push(segment.slice(1));
      return '([^/]+)';
    })
    .join('/');
  return { regex: new RegExp(`^${pattern || ''}/?$`), names };
}

function matchPath(compiled, path) {
  const match = compiled.regex.exec(path.replace(/\/$/, '') || '/');
  if (!match) return null;
  const params = {};
  compiled.names.forEach((name, i) => { params[name] = decodeURIComponent(match[i + 1]); });
  return params;
}

/** Express identifies a router by duck-typing here; `handle` is the contract. */
const isRouter = (value) => value && typeof value.handle === 'function' && Array.isArray(value.stack);

function toHandler(value) {
  if (isRouter(value)) return (req, res, next) => value.handle(req, res, next);
  if (typeof value === 'function') return value;
  throw new TypeError('express shim: handler must be a function or a Router');
}

function runHandlers(handlers, req, res, next) {
  let index = 0;
  const step = (err) => {
    if (err) return next(err);
    if (index >= handlers.length) return next();
    const handler = handlers[index++];
    try {
      const result = handler(req, res, step);
      if (result && typeof result.catch === 'function') result.catch(step);
    } catch (thrown) {
      return next(thrown);
    }
    return undefined;
  };
  step();
}

export class Router {
  constructor() {
    this.stack = [];
  }

  use(pathOrHandler, ...rest) {
    if (typeof pathOrHandler === 'string') {
      this.stack.push({
        kind: 'mount',
        prefix: pathOrHandler.replace(/\/$/, ''),
        handlers: rest.map(toHandler),
      });
    } else {
      this.stack.push({ kind: 'middleware', handlers: [pathOrHandler, ...rest].map(toHandler) });
    }
    return this;
  }

  handle(req, res, done) {
    let index = 0;
    const enteredPath = req.path;

    const next = (err) => {
      if (err) return done(err);
      if (index >= this.stack.length) return done();
      const layer = this.stack[index++];

      if (layer.kind === 'middleware') {
        return runHandlers(layer.handlers, req, res, next);
      }

      if (layer.kind === 'mount') {
        const { prefix } = layer;
        if (enteredPath === prefix || enteredPath.startsWith(`${prefix}/`)) {
          req.path = enteredPath.slice(prefix.length) || '/';
          return runHandlers(layer.handlers, req, res, (err2) => {
            req.path = enteredPath; // restore for sibling layers
            next(err2);
          });
        }
        return next();
      }

      // Method route.
      if (layer.method !== req.method.toLowerCase()) return next();
      const params = matchPath(layer.compiled, enteredPath);
      if (!params) return next();
      req.params = { ...req.params, ...params };
      return runHandlers(layer.handlers, req, res, next);
    };

    next();
  }
}

for (const method of METHODS) {
  Router.prototype[method] = function register(path, ...handlers) {
    this.stack.push({
      kind: 'route',
      method,
      compiled: compilePath(path),
      handlers: handlers.map(toHandler),
    });
    return this;
  };
}

function createResponse(resolve) {
  let finished = false;
  const finish = (payload) => {
    if (finished) return res;
    finished = true;
    resolve({ status: res.statusCode, body: payload, headers: res.headers });
    return res;
  };
  const res = {
    statusCode: 200,
    headers: {},
    get finished() { return finished; },
    status(code) { res.statusCode = code; return res; },
    setHeader(key, value) { res.headers[String(key).toLowerCase()] = value; return res; },
    json: finish,
    send: finish,
    sendFile: () => finish(null),
  };
  return res;
}

class App extends Router {
  constructor() {
    super();
    this.errorHandlers = [];
  }

  disable() { return this; }

  listen() {
    throw new Error('express shim: listen() is not available in the static demo build.');
  }

  use(pathOrHandler, ...rest) {
    // Express tells error middleware apart by arity, and so do we.
    if (typeof pathOrHandler === 'function' && pathOrHandler.length === 4) {
      this.errorHandlers.push(pathOrHandler);
      return this;
    }
    return super.use(pathOrHandler, ...rest);
  }

  /** Runs one request through the stack and resolves with the response. */
  dispatch(method, path, { body = null, query = {}, user = undefined } = {}) {
    return new Promise((resolve) => {
      const req = {
        method: method.toUpperCase(),
        path,
        originalUrl: path,
        params: {},
        query,
        body: body ?? {},
        user,
        get: () => null,
      };
      const res = createResponse(resolve);

      this.handle(req, res, (err) => {
        if (res.finished) return;
        if (err) {
          const errorHandler = this.errorHandlers[0];
          if (errorHandler) {
            errorHandler(err, req, res, () => {});
            if (res.finished) return;
          }
          resolve({ status: 500, body: { error: String(err?.message || err) } });
          return;
        }
        resolve({ status: 404, body: { error: 'Not found' } });
      });
    });
  }
}

export default function express() {
  return new App();
}

express.Router = () => new Router();
express.json = () => (_req, _res, next) => next();
express.static = () => (_req, _res, next) => next();
express.urlencoded = () => (_req, _res, next) => next();
