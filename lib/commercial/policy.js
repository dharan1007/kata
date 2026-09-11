import {commercialError} from './errors.js';

const SEVERITY=Object.freeze({info:0,low:1,medium:2,high:3,critical:4});
const ALLOWED_KEYS=new Set(['maxNewSeverity','forbidFindingCodes','requiredCapabilities','requireSourceBoundRelease']);
const SAFE_ID=/^[A-Za-z0-9_.:-]{1,96}$/;

export function validatePolicyProfile(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw commercialError('INVALID_POLICY',400);
  if(Object.keys(input).some(key=>!ALLOWED_KEYS.has(key)))throw commercialError('INVALID_POLICY',400);
  const maxNewSeverity=input.maxNewSeverity==null?'critical':String(input.maxNewSeverity).toLowerCase();
  if(!(maxNewSeverity in SEVERITY))throw commercialError('INVALID_POLICY',400);
  const normalizeList=value=>{
    if(value==null)return[];
    if(!Array.isArray(value)||value.length>100)throw commercialError('INVALID_POLICY',400);
    const list=[...new Set(value.map(String))];
    if(list.some(item=>!SAFE_ID.test(item)))throw commercialError('INVALID_POLICY',400);
    return Object.freeze(list);
  };
  if(input.requireSourceBoundRelease!=null&&typeof input.requireSourceBoundRelease!=='boolean')throw commercialError('INVALID_POLICY',400);
  return Object.freeze({maxNewSeverity,forbidFindingCodes:normalizeList(input.forbidFindingCodes),requiredCapabilities:normalizeList(input.requiredCapabilities),requireSourceBoundRelease:Boolean(input.requireSourceBoundRelease)});
}

export function evaluatePolicy({report={},baselineDelta={},policy}){
  const validated=validatePolicyProfile(policy||{});
  const violations=[];
  const newFindings=Array.isArray(baselineDelta?.newFindings)?baselineDelta.newFindings:[];
  for(const finding of newFindings){
    const severity=String(finding?.severity||'info').toLowerCase();
    if(!(severity in SEVERITY))continue;
    if(SEVERITY[severity]>SEVERITY[validated.maxNewSeverity])violations.push({code:'NEW_SEVERITY_EXCEEDED',findingCode:String(finding?.code||''),severity});
  }
  const findings=Array.isArray(report?.findings)?report.findings:[];
  for(const finding of findings){
    if(validated.forbidFindingCodes.includes(String(finding?.code||'')))violations.push({code:'FORBIDDEN_FINDING',findingCode:String(finding.code)});
  }
  const capabilities=new Set(Array.isArray(report?.capabilities)?report.capabilities.map(String):[]);
  for(const capability of validated.requiredCapabilities){
    if(!capabilities.has(capability))violations.push({code:'REQUIRED_CAPABILITY_MISSING',capability});
  }
  if(validated.requireSourceBoundRelease&&report?.release?.sourceBound!==true)violations.push({code:'SOURCE_BOUND_RELEASE_REQUIRED'});
  return Object.freeze({pass:violations.length===0,violations:Object.freeze(violations)});
}
