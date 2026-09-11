import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePolicyProfile,evaluatePolicy} from '../lib/commercial/policy.js';
import {toCiOutcome} from '../lib/commercial/ci.js';

test('commercial CI policy is finite declarative data and fails on new severe regressions',()=>{
  const policy=validatePolicyProfile({maxNewSeverity:'high',forbidFindingCodes:['UNSAFE_MUTATION'],requiredCapabilities:['mcp']});
  assert.throws(()=>validatePolicyProfile({predicate:'return true'}),error=>error?.code==='INVALID_POLICY');
  assert.throws(()=>validatePolicyProfile({pattern:'(a+)+$'}),error=>error?.code==='INVALID_POLICY');
  const result=evaluatePolicy({report:{capabilities:['mcp'],findings:[]},baselineDelta:{newFindings:[{code:'X',severity:'critical'}],resolvedFindings:[]},policy});
  assert.equal(result.pass,false);
  assert.ok(result.violations.some(v=>v.code==='NEW_SEVERITY_EXCEEDED'));
});

test('CI outcome classes distinguish regression target auth and platform failure',()=>{
  assert.equal(toCiOutcome({kind:'PASS'}).exitCode,0);
  assert.equal(toCiOutcome({kind:'REGRESSION'}).exitCode,2);
  assert.equal(toCiOutcome({kind:'TARGET_RESTRICTION'}).exitCode,3);
  assert.equal(toCiOutcome({kind:'AUTH_REQUIRED'}).exitCode,4);
  assert.equal(toCiOutcome({kind:'PLATFORM_FAILURE'}).exitCode,5);
  assert.throws(()=>toCiOutcome({kind:'UNKNOWN'}),error=>error?.code==='INVALID_CI_OUTCOME');
});
