import {createHash} from 'node:crypto';
import {validateTrace} from './model.js';

function plain(value){if(value===null||typeof value!=='object'||Array.isArray(value))return false;const p=Object.getPrototypeOf(value);return p===Object.prototype||p===null;}
function stable(value){if(Array.isArray(value))return value.map(stable);if(!plain(value))return value;const out={};for(const key of Object.keys(value).sort())out[key]=stable(value[key]);return out;}

export function canonicalizeTrace(trace){
  validateTrace(trace);
  const copy=structuredClone(trace);
  copy.events=copy.events.map(event=>stable({...event,parents:[...event.parents].sort()}));
  return stable(copy);
}

export function serializeTrace(trace){return JSON.stringify(canonicalizeTrace(trace));}
export function hashTrace(trace){return createHash('sha256').update(serializeTrace(trace)).digest('hex');}
