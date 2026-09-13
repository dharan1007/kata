import {DatabaseSync} from 'node:sqlite';

const OPERATION_ID=/^[A-Za-z][A-Za-z0-9_.:-]{0,255}$/;
const DIGEST=/^sha256:[a-f0-9]{64}$/;
const MAX_JSON_BYTES=4*1024*1024;

function fail(code,detail=''){const error=new Error(detail?`${code}: ${detail}`:code);error.code=code;throw error;}
function validateIdentity({operationId,inputDigest,targetIdentity}){if(typeof operationId!=='string'||!OPERATION_ID.test(operationId))fail('TARGET_EFFECT_OPERATION_ID_INVALID');if(typeof inputDigest!=='string'||!DIGEST.test(inputDigest))fail('TARGET_EFFECT_INPUT_DIGEST_INVALID');if(typeof targetIdentity!=='string'||!targetIdentity||Buffer.byteLength(targetIdentity,'utf8')>2048)fail('TARGET_EFFECT_IDENTITY_INVALID');}
function encode(value,code){let text;try{text=JSON.stringify(value);}catch{fail(code);}if(text===undefined||Buffer.byteLength(text,'utf8')>MAX_JSON_BYTES)fail(code);return text;}
function decode(value,code){try{return JSON.parse(value);}catch{fail(code);}}
function committed(row,replayed){return {status:'COMMITTED',output:decode(row.output_json,'TARGET_EFFECT_LEDGER_CORRUPT'),receipt:decode(row.receipt_json,'TARGET_EFFECT_LEDGER_CORRUPT'),replayed};}

export class SqliteTransactionalEffectTarget{
  constructor({filename}){
    if(typeof filename!=='string'||!filename)fail('TARGET_EFFECT_FILENAME_REQUIRED');
    this.db=new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.db.exec(`CREATE TABLE IF NOT EXISTS kata_effect_ledger(
      operation_id TEXT PRIMARY KEY,
      input_digest TEXT NOT NULL,
      target_identity TEXT NOT NULL,
      output_json TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      committed_at TEXT NOT NULL
    ) STRICT;`);
    this.lookup=this.db.prepare('SELECT operation_id,input_digest,target_identity,output_json,receipt_json,committed_at FROM kata_effect_ledger WHERE operation_id=?');
    this.insert=this.db.prepare('INSERT INTO kata_effect_ledger(operation_id,input_digest,target_identity,output_json,receipt_json,committed_at) VALUES(?,?,?,?,?,?)');
  }
  exec(sql){if(typeof sql!=='string'||!sql.trim())fail('TARGET_EFFECT_SQL_INVALID');this.db.exec(sql);}
  commit({operationId,inputDigest,targetIdentity,apply,at=new Date().toISOString()}){
    validateIdentity({operationId,inputDigest,targetIdentity});if(typeof apply!=='function')fail('TARGET_EFFECT_APPLY_REQUIRED');
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const existing=this.lookup.get(operationId);
      if(existing){
        if(existing.input_digest!==inputDigest||existing.target_identity!==targetIdentity)fail('TARGET_EFFECT_IDENTITY_CONFLICT');
        this.db.exec('COMMIT');return committed(existing,true);
      }
      const result=apply(this.db);
      if(result&&typeof result.then==='function')fail('TARGET_EFFECT_APPLY_MUST_BE_SYNCHRONOUS');
      if(!result||typeof result!=='object'||Array.isArray(result))fail('TARGET_EFFECT_RESULT_INVALID');
      const outputJson=encode(result.output??null,'TARGET_EFFECT_OUTPUT_INVALID');
      const receiptJson=encode(result.receipt??{},'TARGET_EFFECT_RECEIPT_INVALID');
      this.insert.run(operationId,inputDigest,targetIdentity,outputJson,receiptJson,at);
      this.db.exec('COMMIT');
      return {status:'COMMITTED',output:decode(outputJson,'TARGET_EFFECT_OUTPUT_INVALID'),receipt:decode(receiptJson,'TARGET_EFFECT_RECEIPT_INVALID'),replayed:false};
    }catch(error){try{this.db.exec('ROLLBACK');}catch{}throw error;}
  }
  reconcile({operationId,inputDigest,targetIdentity}){
    validateIdentity({operationId,inputDigest,targetIdentity});
    const existing=this.lookup.get(operationId);
    if(!existing)return {status:'NOT_COMMITTED'};
    if(existing.input_digest!==inputDigest||existing.target_identity!==targetIdentity)fail('TARGET_EFFECT_IDENTITY_CONFLICT');
    return committed(existing,true);
  }
  close(){this.db.close();}
}
