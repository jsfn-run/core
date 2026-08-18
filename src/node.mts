export interface RunOptions {
  name?: string;
  port?: number;
  local?: boolean;
  action?: string;
  options?: Record<string, string | number | boolean>;
  credentials?: Record<string, string>;
}

type Fn = <T extends BodyInit>(input: T) => Promise<Response>;

export function fn(runOptions: RunOptions): Fn {
  const options = runOptions.options || {};
  const functionName = runOptions.local ? '' : runOptions.name;
  const action = runOptions.action || '';
  const protocol = runOptions.local ? 'http://' : 'https://';
  const domain = runOptions.local ? 'localhost' : '.jsfn.run';
  const port = runOptions.local && runOptions.port ? ':' + runOptions.port : '';
  const searchParams = String(new URLSearchParams(Object.entries(Object(options))));
  const url = protocol + functionName + domain + port + '/' + action + '?' + searchParams;
  const headers: Record<string, string> = {};

  if (runOptions.credentials) {
    const token = btoa(JSON.stringify(runOptions.credentials));
    headers.Authorization = 'Bearer ' + token;
  }

  return async function <T extends BodyInit>(body: T) {
    const duplex = body instanceof ReadableStream ? { duplex: 'half' } : {};
    const response = await fetch(url, { body, method: 'POST', headers, ...duplex });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return response;
  };
}

function toFn(o: RunOptions | Fn): Fn {
  return typeof o === 'function' ? o : fn(o);
}

export function pipe(...fns: Array<RunOptions | Fn>): Fn {
  if (!fns.length) {
    throw new Error('One or more steps must be provided');
  }

  if (fns.length === 1) {
    return toFn(fns[0]);
  }

  const steps = fns.map(toFn);
  const last = steps.pop();

  return async (input) => {
    let v: BodyInit = input;

    for (const fn of steps) {
      v = (await fn(v)).body;
    }

    return last(v);
  };
}
