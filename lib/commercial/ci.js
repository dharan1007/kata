import {commercialError} from './errors.js';

const OUTCOMES=Object.freeze({
  PASS:Object.freeze({exitCode:0,label:'pass'}),
  REGRESSION:Object.freeze({exitCode:2,label:'regression'}),
  TARGET_RESTRICTION:Object.freeze({exitCode:3,label:'target-restriction'}),
  AUTH_REQUIRED:Object.freeze({exitCode:4,label:'auth-required'}),
  PLATFORM_FAILURE:Object.freeze({exitCode:5,label:'platform-failure'})
});

export function toCiOutcome(result){
  const kind=String(result?.kind||'');
  const mapped=OUTCOMES[kind];
  if(!mapped)throw commercialError('INVALID_CI_OUTCOME',500);
  return Object.freeze({...mapped,kind});
}
