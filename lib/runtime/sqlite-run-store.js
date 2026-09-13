import {DatabaseSync} from 'node:sqlite';

const RUN_ID=/^[A-Za-z][A-Za-z0-9_.:-]{0,191}$/;
const EVENT_TYPE=/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const MAX_EVENT_BYTES=1024*1024;
const MAX_STATE_BYTES=16*1024*1024;
const MAX_APPEND_EVENTS=256;

function fail(code,detail=''){const error=new Error(detail?`${code}: ${detail}`:code);error.code=code;throw error;}
function validRunId(runId){if(typeof runId!=='string'||!RUN_ID.test(runId))fail('RUN_ID_INVALID');}
function validAt(value){if(typeof value!=='string'||value.length>64||Number.isNaN(Date.parse(value)))fail('RUN_EVENT_TIME_INVALID');}
function encode(value,limit,code){let text;try{text=JSON.stringify(value);}catch{fail(code);}if(text===undefined||Buffer.byteLength(text,'utf8')>limit)fail(code);return text;}
function decode(text,code){try{return JSON.parse(text);}catch{fail(code);}}
function conflict(expected,actual){const error=new Error(`RUN_REVISION_CONFLICT: expected ${expected}, actual ${actual}`);error.code='RUN_REVISION_CONFLICT';error.expectedRevision=expected;error.actualRevision=actual;throw error;}

export class SqliteRunStore{
  constructor({filename}){
    if(typeof filename!=='string'||!filename)fail('RUN_STORE_FILENAME_REQUIRED');
    this.db=new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kata_run_heads(
        run_id TEXT PRIMARY KEY,
        revision INTEGER NOT NULL CHECK(revision>=0)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS kata_run_events(
        run_id TEXT NOT NULL,
        seq INTEGER NOT NULL CHECK(seq>0),
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(run_id,seq),
        FOREIGN KEY(run_id) REFERENCES kata_run_heads(run_id) ON DELETE CASCADE
      ) STRICT;
      CREATE TABLE IF NOT EXISTS kata_run_snapshots(
        run_id TEXT PRIMARY KEY,
        revision INTEGER NOT NULL CHECK(revision>=0),
        state_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES kata_run_heads(run_id) ON DELETE CASCADE
      ) STRICT;
      CREATE INDEX IF NOT EXISTS kata_run_events_type_idx ON kata_run_events(run_id,event_type,seq);
    `);
    this.head=this.db.prepare('SELECT revision FROM kata_run_heads WHERE run_id=?');
    this.insertHead=this.db.prepare('INSERT INTO kata_run_heads(run_id,revision) VALUES(?,0)');
    this.insertEvent=this.db.prepare('INSERT INTO kata_run_events(run_id,seq,event_type,payload_json,created_at) VALUES(?,?,?,?,?)');
    this.updateHead=this.db.prepare('UPDATE kata_run_heads SET revision=? WHERE run_id=? AND revision=?');
    this.readEvents=this.db.prepare('SELECT seq,event_type,payload_json,created_at FROM kata_run_events WHERE run_id=? AND seq>? ORDER BY seq');
    this.readSnapshot=this.db.prepare('SELECT revision,state_json,created_at FROM kata_run_snapshots WHERE run_id=?');
    this.upsertSnapshot=this.db.prepare('INSERT INTO kata_run_snapshots(run_id,revision,state_json,created_at) VALUES(?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET revision=excluded.revision,state_json=excluded.state_json,created_at=excluded.created_at WHERE excluded.revision>=kata_run_snapshots.revision');
  }

  append(runId,expectedRevision,events){
    validRunId(runId);
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)fail('RUN_REVISION_INVALID');
    if(!Array.isArray(events)||events.length<1||events.length>MAX_APPEND_EVENTS)fail('RUN_EVENT_BATCH_INVALID');
    const prepared=events.map(event=>{
      if(!event||typeof event!=='object'||Array.isArray(event)||typeof event.type!=='string'||!EVENT_TYPE.test(event.type))fail('RUN_EVENT_INVALID');
      validAt(event.at);
      return {type:event.type,payload:encode(event.payload??{},MAX_EVENT_BYTES,'RUN_EVENT_PAYLOAD_INVALID'),at:event.at};
    });
    this.db.exec('BEGIN IMMEDIATE');
    try{
      let row=this.head.get(runId);
      if(!row){if(expectedRevision!==0)conflict(expectedRevision,0);this.insertHead.run(runId);row={revision:0};}
      const current=Number(row.revision);
      if(current!==expectedRevision)conflict(expectedRevision,current);
      let seq=current;
      for(const event of prepared){seq++;this.insertEvent.run(runId,seq,event.type,event.payload,event.at);}
      const update=this.updateHead.run(seq,runId,current);
      if(Number(update.changes)!==1)fail('RUN_REVISION_UPDATE_FAILED');
      this.db.exec('COMMIT');
      return {runId,revision:seq};
    }catch(error){try{this.db.exec('ROLLBACK');}catch{}throw error;}
  }

  load(runId,{afterRevision=0}={}){
    validRunId(runId);
    if(!Number.isSafeInteger(afterRevision)||afterRevision<0)fail('RUN_REVISION_INVALID');
    const row=this.head.get(runId);
    const revision=row?Number(row.revision):0;
    const events=this.readEvents.all(runId,afterRevision).map(item=>({seq:Number(item.seq),type:item.event_type,payload:decode(item.payload_json,'RUN_EVENT_CORRUPT'),at:item.created_at}));
    return {runId,revision,events};
  }

  saveSnapshot(runId,expectedRevision,state,at=new Date().toISOString()){
    validRunId(runId);validAt(at);
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)fail('RUN_REVISION_INVALID');
    const stateJson=encode(state,MAX_STATE_BYTES,'RUN_SNAPSHOT_INVALID');
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const row=this.head.get(runId);const current=row?Number(row.revision):0;
      if(current!==expectedRevision)conflict(expectedRevision,current);
      this.upsertSnapshot.run(runId,current,stateJson,at);
      this.db.exec('COMMIT');
      return {runId,revision:current};
    }catch(error){try{this.db.exec('ROLLBACK');}catch{}throw error;}
  }

  loadSnapshot(runId){
    validRunId(runId);
    const row=this.readSnapshot.get(runId);
    if(!row)return null;
    return {runId,revision:Number(row.revision),state:decode(row.state_json,'RUN_SNAPSHOT_CORRUPT'),at:row.created_at};
  }

  close(){this.db.close();}
}
