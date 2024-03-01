import type { ServerResponse } from 'node:http';
import type { Request, ApiDescription, Configuration } from './types.mjs';

export function describeApi(configuration: Configuration): ApiDescription {
  return {
    description: configuration.description,
    actions: Object.entries(configuration.actions).map(([name, value]) => {
      let { input = 'raw', output = 'raw', credentials = [], options = {}, description = '' } = value;
      return {
        name,
        input,
        output,
        credentials,
        options,
        description,
        default: !!value.default,
      };
    }),
  };
}

export function generateEsModule(configuration: Configuration, fnName: string) {
  const description = describeApi(configuration);
  const outputMap = {
    json: 'response.json()',
    text: 'response.text()',
    dom: '__d(await response.text())',
  };

  const lines = description.actions.map((_) =>
    [
      _.default ? 'export default ' : '',
      `async function ${_.name}(i,o = {}) {`,
      `${(_.input === 'json' && 'i=JSON.stringify(i||{});') || ''}`,
      `const response=await fetch(__url+'/${_.name}?' + __s(o),{mode:'cors',method:'POST',body:i});`,
      `return ${outputMap[_.output] || 'response'};}`,
    ].join(''),
  );

  lines.push(`const __url='https://${fnName}.jsfn.run';`);
  lines.push(`const __s=(o={})=>new URLSearchParams(o).toString();`);

  if (description.actions.find((a) => a.output === 'dom')) {
    lines.push(`const __d=(h,t,s,z,d=document)=>{
t=d.createElement('template');t.innerHTML=h;z=t.content.cloneNode(true);t=[];
z.querySelectorAll('script,style').forEach(n=>{
s=d.createElement(n.nodeName.toLowerCase());
['innerHTML','type','src'].map(k=>{if (n[k]) s[k]=n[k];});t.push(s);n.remove();
});return [...z.childNodes,...t].map(n=>d.body.append(n)),''}`);
  }

  lines.push('export { ' + description.actions.map((f) => f.name).join(', ') + ' }');

  return lines.join('\n');
}

const isNumberRe = /^[0-9]+$/;
export function parseOption(value) {
  if (value === 'true' || value === 'false') {
    return value === 'true';
  }

  if (isNumberRe.test(String(value))) {
    return Number(value);
  }

  return value;
}

export function readCredentials(request: Request) {
  const requiredCredentials = request.action.credentials || [];

  if (requiredCredentials.length && request.headers.authorization) {
    const token = request.headers.authorization.replace(/\s*Bearer\s*/, '').trim();
    const json = Buffer.from(token, 'base64').toString('utf-8');
    const credentials = JSON.parse(json);

    requiredCredentials.forEach((key) => (request.credentials[key] = credentials[key]));
  }
}

export function setCorsHeaders(response: ServerResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
}

export const timestamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

export const tryToParseJson = (data: string) => {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};
