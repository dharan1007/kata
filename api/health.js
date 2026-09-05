import {method,send} from '../lib/server/http.js';
export default async function handler(req,res){if(!method(req,res,['GET']))return;return send(res,200,{ok:true,service:'kata-webmcp',version:'3.0.0',apiVersion:'v2'},{'Cache-Control':'no-store'});}
