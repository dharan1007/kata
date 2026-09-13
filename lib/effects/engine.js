import {createHash} from 'node:crypto';

const DIGEST=/^sha256:[a-f0-9]{64}$/;
const SAFE_REPLAY_MODES=new Set(['intrinsic','keyed']);

function fail(code,detail=''){const error=new Error(detail?`${code}: ${detail}`:code);error.code=code;throw error;}
function plain(value){if(value===null||typeof value!=='object'||Array.isArray(value))return false;const p=Object.getPrototypeOf(value);return p===Object.prototype||p===null;}
function stable(value){if(Array.isArray(value))return value.map(stable);if(plain(value)){const out={};for(const key of Object.keys(value).sort())out[key]=stable(value[key]);return out;}return value;}
function hash(value){return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');}
function now(clock){const value=clock();if(typeof value!=='string'||Number.isNaN(Date.parse(value)))fail('EFFECT_CLOCK_INVALID');return value;}
function append(store,runId,revision,type,payload,clock){return store.append(runId,revision,[{type,payload,at:now(clock)}]).revision;}
function contextFor({runId,node,args,programHash}){
  if(typeof programHash!=='string'||!DIGEST.test(programHash))fail('EFFECT_PROGRAM_HASH_INVALID');
  const inputDigest=`sha256:${hash(args)}`;
  const targetIdentity=String(node.spec?.resourceKey??node.spec?.target?.name??node.id);
  const raw=hash({runId,programHash,nodeId:node.id,inputDigest,targetIdentity});
  return {runId,nodeId:node.id,operationId:`eff_${raw}`,idempotencyKey:`kata_${raw}`,inputDigest,targetIdentity,effectClass:node.effect.class,idempotency:node.effect.idempotency};
}
function stateFor(events,operationId){
  const matching=events.filter(event=>event.payload?.operationId===operationId);
  return {prepared:matching.find(event=>event.type==='EffectPrepared')??null,confirmed:[...matching].reverse().find(event=>event.type==='EffectConfirmed')??null,uncertain:[...matching].reverse().find(event=>event.type==='EffectUncertain')??null};
}
function normalizeOutcome(value){if(!value||typeof value!=='object'||Array.isArray(value)||!['COMMITTED','NOT_COMMITTED','UNKNOWN'].includes(value.status))fail('EFFECT_OUTCOME_INVALID');return value;}

export function createEffectEngine({store,execute,reconcile,clock=()=>new Date().toISOString()}){
  if(!store||typeof store.append!=='function'||typeof store.load!=='function')fail('EFFECT_STORE_INVALID');
  if(typeof execute!=='function')fail('EFFECT_EXECUTOR_REQUIRED');
  if(reconcile!==undefined&&typeof reconcile!=='function')fail('EFFECT_RECONCILER_INVALID');
  return {async perform({runId,revision,node,args,programHash}){
    const context=contextFor({runId,node,args,programHash});
    let history=store.load(runId);
    if(history.revision!==revision)fail('RUN_REVISION_CONFLICT');
    let effectState=stateFor(history.events,context.operationId);
    if(effectState.confirmed)return {status:'COMPLETED',output:structuredClone(effectState.confirmed.payload.output),receipt:structuredClone(effectState.confirmed.payload.receipt),revision};
    const wasPrepared=Boolean(effectState.prepared);
    if(!wasPrepared){
      revision=append(store,runId,revision,'EffectPrepared',{...context},clock);
      history=store.load(runId);effectState=stateFor(history.events,context.operationId);
    }

    if(wasPrepared){
      if(typeof reconcile==='function'){
        const outcome=normalizeOutcome(await reconcile({...context,node}));
        if(outcome.status==='COMMITTED'){
          revision=append(store,runId,revision,'EffectConfirmed',{...context,output:outcome.output??null,receipt:outcome.receipt??{},resultDigest:`sha256:${hash(outcome.output??null)}`,reconciled:true},clock);
          return {status:'COMPLETED',output:structuredClone(outcome.output??null),receipt:structuredClone(outcome.receipt??{}),revision,reconciled:true};
        }
        if(outcome.status==='UNKNOWN'){
          revision=append(store,runId,revision,'EffectUncertain',{...context,reason:String(outcome.reason??'RECONCILIATION_UNKNOWN').slice(0,256)},clock);
          return {status:'BLOCKED',reason:'EFFECT_OUTCOME_UNKNOWN',revision};
        }
      }else if(!SAFE_REPLAY_MODES.has(context.idempotency)){
        if(!effectState.uncertain)revision=append(store,runId,revision,'EffectUncertain',{...context,reason:'NO_SAFE_RECONCILIATION_PATH'},clock);
        return {status:'BLOCKED',reason:'EFFECT_OUTCOME_UNKNOWN',revision};
      }
    }

    try{
      const outcome=normalizeOutcome(await execute({...context,node,args}));
      if(outcome.status!=='COMMITTED'){
        if(outcome.status==='UNKNOWN'){revision=append(store,runId,revision,'EffectUncertain',{...context,reason:String(outcome.reason??'EXECUTION_UNKNOWN').slice(0,256)},clock);return {status:'BLOCKED',reason:'EFFECT_OUTCOME_UNCERTAIN',revision};}
        fail('EFFECT_EXECUTOR_DID_NOT_COMMIT');
      }
      revision=append(store,runId,revision,'EffectConfirmed',{...context,output:outcome.output??null,receipt:outcome.receipt??{},resultDigest:`sha256:${hash(outcome.output??null)}`,reconciled:false},clock);
      return {status:'COMPLETED',output:structuredClone(outcome.output??null),receipt:structuredClone(outcome.receipt??{}),revision,reconciled:false};
    }catch(error){
      revision=append(store,runId,revision,'EffectUncertain',{...context,reason:typeof error?.code==='string'?error.code:'EXECUTION_RESPONSE_LOST'},clock);
      return {status:'BLOCKED',reason:'EFFECT_OUTCOME_UNCERTAIN',revision};
    }
  }};
}
