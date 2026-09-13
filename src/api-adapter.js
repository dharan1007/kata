const SAFE_NAME=/^[A-Za-z0-9_-]{1,64}$/;
const PARAM_LOCATIONS=new Set(['path','query','header']);
const FORBIDDEN_HEADERS=new Set(['authorization','cookie','proxy-authorization','set-cookie','host','content-length','origin','referer']);
const MAX_TOOLS=100;

function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
function safeHttpUrl(raw,base){try{const url=new URL(String(raw),base);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;url.hash='';return url;}catch{return null;}}
function primitiveParameterSchema(schema){if(!schema||typeof schema!=='object'||Array.isArray(schema))return null;const type=schema.type;if(!['string','integer','number','boolean'].includes(type))return null;return clone(schema);}
function arrayParameterSchema(schema){if(!schema||typeof schema!=='object'||Array.isArray(schema)||schema.type!=='array')return null;const items=primitiveParameterSchema(schema.items);if(!items)return null;return{...clone(schema),items};}
function normalizedParameterStyle(parameter){const location=parameter?.in,declared=typeof parameter?.style==='string'?parameter.style:null;if(location==='path')return declared??'simple';if(location==='query')return declared??'form';if(location==='header')return declared??'simple';return declared;}
function normalizedExplode(parameter){if(typeof parameter?.explode==='boolean')return parameter.explode;return normalizedParameterStyle(parameter)==='form';}
function supportedParameterSchema(parameter){const primitive=primitiveParameterSchema(parameter?.schema);if(primitive)return primitive;if(parameter?.in==='query')return arrayParameterSchema(parameter?.schema);return null;}
function supportedParameterSerialization(parameter){const style=normalizedParameterStyle(parameter),schema=supportedParameterSchema(parameter);if(!schema)return false;if(parameter?.allowReserved!==undefined&&typeof parameter.allowReserved!=='boolean')return false;if(schema.type!=='array'){if(parameter?.in==='path')return style==='simple'||style==='label'||style==='matrix';if(parameter?.in==='query')return style==='form';if(parameter?.in==='header')return style==='simple';return false;}if(parameter?.in!=='query'||parameter?.allowReserved===true)return false;const explode=normalizedExplode(parameter);if(style==='form')return true;if(style==='spaceDelimited'||style==='pipeDelimited')return explode===false;return false;}
function groupSchema(parameters,location){const properties={},required=[];for(const parameter of Array.isArray(parameters)?parameters:[]){if(parameter?.in!==location||typeof parameter.name!=='string'||!parameter.name)continue;if(location==='header'&&FORBIDDEN_HEADERS.has(parameter.name.toLowerCase()))continue;const schema=supportedParameterSchema(parameter);if(!schema||!supportedParameterSerialization(parameter))continue;properties[parameter.name]=schema;if(parameter.required)required.push(parameter.name);}if(!Object.keys(properties).length)return null;return{type:'object',properties,...(required.length?{required}:{}),additionalProperties:false};}
function descriptionFor(discovery,operation){return (discovery.descriptions??[]).find(item=>item?.url===operation.descriptionUrl)||null;}
function resolveServerDefinition(server,base){
  if(typeof server==='string'){if(server.includes('{')||server.includes('}'))return null;return safeHttpUrl(server,base);}
  if(!server||typeof server!=='object'||Array.isArray(server)||typeof server.url!=='string')return null;
  let raw=server.url;
  const variables=server.variables&&typeof server.variables==='object'&&!Array.isArray(server.variables)?server.variables:{};
  const names=[...new Set([...raw.matchAll(/\{([^{}]+)\}/g)].map(match=>match[1]))];
  for(const name of names){
    if(!Object.hasOwn(variables,name))return null;
    const variable=variables[name];
    if(!variable||typeof variable!=='object'||Array.isArray(variable)||typeof variable.default!=='string')return null;
    if(Array.isArray(variable.enum)&&variable.enum.length&&!variable.enum.includes(variable.default))return null;
    raw=raw.split(`{${name}}`).join(variable.default);
  }
  if(/[{}]/.test(raw))return null;
  return safeHttpUrl(raw,base);
}
function operationBaseUrl(discovery,operation){const description=descriptionFor(discovery,operation);if(!description)return null;const definitions=Array.isArray(operation?.serverDefinitions)?operation.serverDefinitions:Array.isArray(description.serverDefinitions)?description.serverDefinitions:null;if(definitions?.length)return resolveServerDefinition(definitions[0],description.url);const servers=Array.isArray(operation?.servers)?operation.servers:description.servers;const raw=Array.isArray(servers)&&servers.length?servers[0]:'/';return resolveServerDefinition(raw,description.url);}
function inputSchemaFor(operation){const properties={},required=[];for(const location of PARAM_LOCATIONS){const key=location==='header'?'headers':location;const group=groupSchema(operation.parameters,location);if(!group)continue;properties[key]=group;if((group.required??[]).length)required.push(key);}const body=operation.requestBody;if(body?.contentType==='application/json'&&body.schema&&typeof body.schema==='object'){properties.body=clone(body.schema);if(body.required)required.push('body');}return{type:'object',properties,...(required.length?{required}:{}),additionalProperties:false};}
function hasUnsupportedRequiredParameter(operation){if(operation?.hasUnresolvedRequiredInputs)return true;for(const parameter of Array.isArray(operation.parameters)?operation.parameters:[]){if(!parameter?.required)continue;if(!PARAM_LOCATIONS.has(parameter.in))return true;if(parameter.in==='header'&&FORBIDDEN_HEADERS.has(String(parameter.name).toLowerCase()))return true;if(!supportedParameterSchema(parameter)||!supportedParameterSerialization(parameter))return true;}if(operation.requestBody?.required&&operation.requestBody?.contentType!=='application/json')return true;return false;}
function pathSerializationFor(operation){const out={};for(const parameter of Array.isArray(operation?.parameters)?operation.parameters:[]){if(parameter?.in!=='path'||typeof parameter.name!=='string'||!parameter.name||!primitiveParameterSchema(parameter.schema)||!supportedParameterSerialization(parameter))continue;out[parameter.name]=normalizedParameterStyle(parameter);}return out;}
function querySerializationFor(operation){const out={};for(const parameter of Array.isArray(operation?.parameters)?operation.parameters:[]){if(parameter?.in!=='query'||typeof parameter.name!=='string'||!parameter.name||!supportedParameterSerialization(parameter))continue;const schema=supportedParameterSchema(parameter);out[parameter.name]={style:normalizedParameterStyle(parameter),explode:normalizedExplode(parameter),type:schema.type,allowReserved:parameter.allowReserved===true};}return out;}
function makeUrlTemplate(base,path){if(typeof path!=='string'||!path.startsWith('/'))return null;const url=safeHttpUrl(base.href);if(!url)return null;const prefix=url.pathname==='/'?'':url.pathname.replace(/\/$/,'');url.pathname=`${prefix}${path}`;return url.href.replace(/%7B/gi,'{').replace(/%7D/gi,'}');}

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
    const securityRequirements=Array.isArray(operation.securityRequirements)?clone(operation.securityRequirements):[];
    const securitySchemes=Array.isArray(operation.securitySchemes)?clone(operation.securitySchemes):[];
    const anonymousAlternative=securityRequirements.length===0||securityRequirements.some(requirement=>Array.isArray(requirement)&&requirement.length===0);
    names.add(name);
    tools.push({
      kind:'openapi-candidate',name,
      description:operation.summary||`${operation.method} ${operation.path}`,
      inputSchema:inputSchemaFor(operation),
      annotations:{readOnlyHint:String(operation.method).toUpperCase()==='GET'||String(operation.method).toUpperCase()==='HEAD',untrustedContentHint:true},
      execution:{mode:'preview-only',method:String(operation.method??'').toUpperCase(),urlTemplate,pathSerialization:pathSerializationFor(operation),querySerialization:querySerializationFor(operation),descriptionUrl:operation.descriptionUrl??null,security:Array.isArray(operation.security)?[...operation.security]:[],securityRequirements,securitySchemes,requiresAuthorization:!anonymousAlternative,streamingMedia:Array.isArray(operation.streamingMedia)?[...operation.streamingMedia]:[]}
    });
  }
  return{tools,rejected,executesOperations:false,limits:{maxTools}};
}

function assertObject(value,label){if(value===undefined)return{};if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError(`${label} must be an object`);return value;}
function appendRawQuery(url,name,encodedValue){const pair=`${encodeURIComponent(name)}=${encodedValue}`;url.search=url.search?`${url.search}&${pair}`:`?${pair}`;}
function encodeReservedQueryValue(value){const raw=String(value);let encoded='';for(let i=0;i<raw.length;){if(raw[i]==='%'&&/^[0-9A-Fa-f]{2}$/.test(raw.slice(i+1,i+3))){encoded+=raw.slice(i,i+3);i+=3;continue;}const point=String.fromCodePoint(raw.codePointAt(i));i+=point.length;if(/^[A-Za-z0-9._~-]$/.test(point)||":/?@!$'()*,;".includes(point)){encoded+=point;continue;}encoded+=encodeURIComponent(point);}return encoded;}
function appendQuery(url,name,value,serialization={style:'form',explode:true,type:'string',allowReserved:false}){if(value===undefined)return;if(serialization.type!=='array'){if(['string','number','boolean'].includes(typeof value)){if(serialization.allowReserved){appendRawQuery(url,name,encodeReservedQueryValue(value));return;}url.searchParams.append(name,String(value));return;}throw new TypeError(`Unsupported query value for ${name}`);}if(!Array.isArray(value))throw new TypeError(`Query parameter ${name} must be an array`);for(const item of value)if(!['string','number','boolean'].includes(typeof item))throw new TypeError(`Unsupported query array value for ${name}`);if(serialization.style==='form'&&serialization.explode){for(const item of value)url.searchParams.append(name,String(item));return;}if(serialization.style==='spaceDelimited'){appendRawQuery(url,name,value.map(item=>encodeURIComponent(String(item))).join('%20'));return;}const delimiter=serialization.style==='form'?',':serialization.style==='pipeDelimited'?'|':null;if(delimiter===null)throw new TypeError(`Unsupported query serialization style for ${name}: ${serialization.style}`);url.searchParams.append(name,value.map(String).join(delimiter));}
function serializePrimitivePath(name,value,style){const encoded=encodeURIComponent(String(value));if(style==='simple')return encoded;if(style==='label')return `.${encoded}`;if(style==='matrix')return `;${encodeURIComponent(name)}=${encoded}`;throw new TypeError(`Unsupported path serialization style for ${name}: ${style}`);}
export function previewOpenApiRequest(candidate,args={}){
  if(candidate?.kind!=='openapi-candidate'||candidate?.execution?.mode!=='preview-only')throw new TypeError('A preview-only OpenAPI candidate is required');
  const input=assertObject(args,'arguments'),schema=candidate.inputSchema??{properties:{}};for(const group of schema.required??[])if(input[group]===undefined)throw new TypeError(`Missing required ${group} input`);
  const pathInput=assertObject(input.path,'path'),queryInput=assertObject(input.query,'query'),headerInput=assertObject(input.headers,'headers');let urlText=candidate.execution.urlTemplate;
  const pathSchema=schema.properties?.path,pathSerialization=candidate.execution.pathSerialization??{};for(const name of pathSchema?.required??[])if(pathInput[name]===undefined)throw new TypeError(`Missing required path parameter: ${name}`);
  for(const [name,value] of Object.entries(pathInput)){if(pathSchema?.properties?.[name]===undefined)throw new TypeError(`Unknown path parameter: ${name}`);urlText=urlText.replaceAll(`{${name}}`,serializePrimitivePath(name,value,pathSerialization[name]??'simple'));}
  if(/\{[^}]+\}/.test(urlText))throw new TypeError('Not all path parameters were provided');
  const url=safeHttpUrl(urlText);if(!url)throw new TypeError('Candidate URL is not a safe HTTP(S) URL');const querySchema=schema.properties?.query,querySerialization=candidate.execution.querySerialization??{};
  for(const [name,value] of Object.entries(queryInput)){if(querySchema?.properties?.[name]===undefined)throw new TypeError(`Unknown query parameter: ${name}`);appendQuery(url,name,value,querySerialization[name]);}
  const headers={},headerSchema=schema.properties?.headers;for(const [name,value] of Object.entries(headerInput)){if(headerSchema?.properties?.[name]===undefined)throw new TypeError(`Unknown header parameter: ${name}`);if(FORBIDDEN_HEADERS.has(name.toLowerCase()))throw new TypeError(`Credential or transport header is not accepted as a tool argument: ${name}`);headers[name]=String(value);}
  let body=null;if(input.body!==undefined){if(!schema.properties?.body)throw new TypeError('This operation does not accept a JSON body');headers['Content-Type']='application/json';body=JSON.stringify(input.body);}
  return{method:candidate.execution.method,url:url.href,headers,body,requiresAuthorization:Boolean(candidate.execution.requiresAuthorization),security:[...(candidate.execution.security??[])],securityRequirements:clone(candidate.execution.securityRequirements??[]),securitySchemes:clone(candidate.execution.securitySchemes??[]),streamingMedia:[...(candidate.execution.streamingMedia??[])],readyToExecute:false,executes:false};
}