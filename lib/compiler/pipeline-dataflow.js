import {compileTraces as compileBase} from './index.js';

export function compileWithLineage(name,traces){
  return compileBase(name,traces);
}
