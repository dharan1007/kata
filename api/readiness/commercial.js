import {method,send,errorResponse} from '../../lib/server/http.js';
import {evaluateCommercialReadiness} from '../../lib/commercial/readiness.js';
import {runtimeReleaseEvidence} from '../../lib/commercial/runtime-release.js';

export default function handler(req,res){
  if(!method(req,res,['GET']))return;
  try{
    const release=runtimeReleaseEvidence(process.env);
    const readiness=evaluateCommercialReadiness({env:process.env,release});
    return send(res,200,{ok:true,readiness},{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  }catch(error){return errorResponse(res,error);}
}
