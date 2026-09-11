import {method,send,errorResponse} from '../lib/server/http.js';
import {getPublicPlans} from '../lib/commercial/plans.js';

export default function handler(req,res){
  if(!method(req,res,['GET']))return;
  try{return send(res,200,{ok:true,plans:getPublicPlans()},{'Cache-Control':'public, s-maxage=300, stale-while-revalidate=3600','X-Content-Type-Options':'nosniff'});}
  catch(error){return errorResponse(res,error);}
}
