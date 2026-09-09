const SAFE_NAME=/^[A-Za-z0-9_-]{1,64}$/;
const PARAM_LOCATIONS=new Set(['path','query','header']);
const FORBIDDEN_HEADERS=new Set(['authorization','cookie','proxy-authorization','set-cookie','host','content-length','origin','referer']);
const MAX_TOOLS=100;

function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
function safeHttpUrl(raw,base){
  try{
    const url=new URL(String(raw),base);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;
    url.hash='';
    return url;
  }catch{return null;}
}
function primitiveParameterSchema(schema){
  if(!schema||typeof schema!=='object'||Array.isArray(schema))return null;
  const type=schema.type;
  if(!['string','integer','number','boolean'].includes(type))return null;
  return clone(schema);
}
function groupSchema(parameters,location){
  const properties={},required=[];
  for(const parameter of Array.isArray(parameters)?parameters:[]){
    if(parameter?.in!==location||typeof parameter.name!=='string'||!parameter.name)continue;
    if(location==='header'&&FORBIDDEN_HEADERS.has(parameter.name.toLowerCase()))continue;
    const schema=primitiveParameterSchema(parameter.schema);if(!schema)continue;
    properties[parameter.name]=schema;if(parameter.required)required.push(parameter.name);
  }
  if(!Object.keys(properties).length)return null;
  return{type:'object',properties,...(required.length?{required}:{}),additionalProperties:false};
}
function descriptionFor(discovery,operation){
  return (discovery.descriptions??[]).find(item=>item?.url===operation.descriptionUrl)||null;
}
function operationBaseUrl(discovery,operation){
  const description=descriptionFor(discovery,operation);if(!description)return null;
  const raw=Array.isArray(description.servers)&&description.servers.length?description.servers[0]:'/';
  if(typeof raw!=='string'||raw.includes('{'))return null;
  return safeHttpUrl(raw,description.url);
}
function inputSchemaFor(operation){
  const properties={},required=[];
  for(const location of PARAM_LOCATIONS){
    const key=location==='header'?'headers':location;
    const group=groupSchema(operation.parameters,location);if(!group)continue;
    properties[key]=group;if((group.required??[]).length)required.push(key);
  }
  const body=operation.requestBody;
  if(body?.contentType==='application/json'&&body.schema&&typeof body.schema==='object'){
    properties.body=clone(body.schema);if(body.required)required.push('body');
  }
  return{type:'object',properties,...(required.length?{required}:{}),additionalProperties:false};
}
function hasUnsupportedRequiredParameter(operation){
  if(operation?.hasUnresolvedRequiredInputs)return true;
  for(const parameter of Array.isArray(operation.parameters)?operation.parameters:[]){
    if(!parameter?.required)continue;
    if(!PARAM_LOCATIONS.has(parameter.in))return true;
    if(parameter.in==='header'&&FORBIDDEN_HEADERS.has(String(parameter.name).toLowerCase()))return true;
    if(!primitiveParameterSchema(parameter.schema))return true;
  }
  if(operation.requestBody?.required&&operation.requestBody?.contentType!=='application/json')return true;
  return false;
}
function makeUrlTemplate(base,path){
  if(typeof path!=='string'||!path.startsWith('/'))return null;
  const url=safeHttpUrl(base.href);if(!url)return null;
  const prefix=url.pathname==='/'?'':url.pathname.replace(/\/$/,'');
  url.pathname=`${prefix}${path}`;
  return url.href.replace(/%7B/gi,'{').replace(/%7D/gi,'}');
}

export function compileOpenApiCandidates(discovery={},options={}){
  const maxTools=Math.max(1,Math.min(MAX_TOOLS,Number.isInteger(options.maxTools)?options.maxTools:50));
  const tools=[],rejected=[],names=new Set();
  for(const operation of Array.isArray(discovery.operations)?discovery.operations:[]){
    if(tools.length>=maxTools)break;
    const name=operation?.operationId;
    if(typeof name!=='string'||!SAFE_NAME.test(name)){rejected.push({operationId:name??null,method:operation?.method??null,path:operation?.path??null,reason:'invalid_agent_name'});continue;}
    if(names.has(name)){rejected.push({operationId:name,method:operation?.method??null,path:operation?.path??null,reason:'duplicate_agent_name'});continue;}
    const base=operationBaseUrl(discovery,operation),urlTemplate=base?makeUrlTemplate(base,operation.path):null;
    if(!urlTemplate){rejected.push({operationId:name,method:operation?.method??null,path:operation?.path??null,reason:'unsafe_or_unresolved_server'});continue;}
    if(hasUnsupportedRequiredParameter(operation)){rejected.push({operationId:name,method:operation?.method??null,path:operation?.path??null,reason:'unsupported_required_input'});continue;}
    names.add(name);
    tools.push({
      kind:'openapi-candidate',name,
      description:operation.summary||`${operation.method} ${operation.path}`,
      inputSchema:inputSchemaFor(operation),
      annotations:{readOnlyHint:String(operation.method).toUpperCase()==='GET'||String(operation.method).toUpperCase()==='HEAD',untrustedContentHint:true},
      execution:{
        mode:'preview-only',method:String(operation.method??'').toUpperCase(),urlTemplate,
        descriptionUrl:operation.descriptionUrl??null,
        security:Array.isArray(operation.security)?[...operation.security]:[],
        requiresAuthorization:Array.isArray(operation.security)&&operation.security.length>0,
        streamingMedia:Array.isArray(operation.streamingMedia)?[...operation.streamingMedia]:[]
      }
    });
  }
  return{tools,rejected,executesOperations:false,limits:{maxTools}};
}

function assertObject(value,label){if(value===undefined)return{};if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError(`${label} must be an object`);return value;}
function appendQuery(url,name,value){
  if(value===undefined)return;
  if(['string','number','boolean'].includes(typeof value)){url.searchParams.append(name,String(value));return;}
  throw new TypeError(`Unsupported query value for ${name}`);
}
export function previewOpenApiRequest(candidate,args={}){
  if(candidate?.kind!=='openapi-candidate'||candidate?.execution?.mode!=='preview-only')throw new TypeError('A preview-only OpenAPI candidate is required');
  const input=assertObject(args,'arguments'),schema=candidate.inputSchema??{properties:{}};
  for(const group of schema.required??[])if(input[group]===undefined)throw new TypeError(`Missing required ${group} input`);
  const pathInput=assertObject(input.path,'path'),queryInput=assertObject(input.query,'query'),headerInput=assertObject(input.headers,'headers');
  let urlText=candidate.execution.urlTemplate;
  const pathSchema=schema.properties?.path;
  for(const name of pathSchema?.required??[])if(pathInput[name]===undefined)throw new TypeError(`Missing required path parameter: ${name}`);
  for(const [name,value] of Object.entries(pathInput)){
    if(pathSchema?.properties?.[name]===undefined)throw new TypeError(`Unknown path parameter: ${name}`);
    urlText=urlText.replaceAll(`{${name}}`,encodeURIComponent(String(value)));
  }
  if(/\{[^}]+\}/.test(urlText))throw new TypeError('Not all path parameters were provided');
  const url=safeHttpUrl(urlText);if(!url)throw new TypeError('Candidate URL is not a safe HTTP(S) URL');
  const querySchema=schema.properties?.query;
  for(const [name,value] of Object.entries(queryInput)){if(querySchema?.properties?.[name]===undefined)throw new TypeError(`Unknown query parameter: ${name}`);appendQuery(url,name,value);}
  const headers={};const headerSchema=schema.properties?.headers;
  for(const [name,value] of Object.entries(headerInput)){
    if(headerSchema?.properties?.[name]===undefined)throw new TypeError(`Unknown header parameter: ${name}`);
    if(FORBIDDEN_HEADERS.has(name.toLowerCase()))throw new TypeError(`Credential or transport header is not accepted as a tool argument: ${name}`);
    headers[name]=String(value);
  }
  let body=null;
  if(input.body!==undefined){if(!schema.properties?.body)throw new TypeError('This operation does not accept a JSON body');headers['Content-Type']='application/json';body=JSON.stringify(input.body);}
  return{method:candidate.execution.method,url:url.href,headers,body,requiresAuthorization:Boolean(candidate.execution.requiresAuthorization),security:[...(candidate.execution.security??[])],streamingMedia:[...(candidate.execution.streamingMedia??[])],readyToExecute:false,executes:false};
}
