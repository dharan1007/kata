function enabled(value){return String(value||'').trim().toLowerCase()==='true';}
function present(value){return typeof value==='string'&&value.trim().length>0;}
function check(name,ready,reason){return{name,status:ready?'ready':'blocked',...(ready?{}:{reason})};}
function providerName(value){const name=String(value||'').trim().toLowerCase();return name||null;}

function secureHttpsUrl(value){
  if(!present(value))return false;
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.hash;}catch{return false;}
}
function postgresUrl(value){
  if(!present(value))return false;
  try{const url=new URL(value);return url.protocol==='postgres:'||url.protocol==='postgresql:';}catch{return false;}
}
function identityConfigured(env){return providerName(env.KATA_IDENTITY_PROVIDER)==='oidc'&&secureHttpsUrl(env.KATA_OIDC_USERINFO_URL);}
function databaseConfigured(env){return providerName(env.KATA_DATABASE_PROVIDER)==='postgres'&&postgresUrl(env.KATA_DATABASE_URL||env.DATABASE_URL);}
function razorpayConfigured(env){
  return present(env.KATA_RAZORPAY_KEY_ID)&&present(env.KATA_RAZORPAY_KEY_SECRET)&&present(env.KATA_RAZORPAY_DEVELOPER_PLAN_ID)&&present(env.KATA_RAZORPAY_TEAM_PLAN_ID);
}
function razorpayWebhookConfigured(env){return present(env.KATA_RAZORPAY_WEBHOOK_SECRET);}

export function evaluateCommercialReadiness({env=process.env,release={}}={}){
  const identityProvider=identityConfigured(env)?'oidc':null;
  const databaseProvider=databaseConfigured(env)?'postgres':null;
  const checks=[
    check('release',Boolean(release.sourceBound&&present(release.releaseSha)),'source-bound release evidence missing'),
    check('identity',identityProvider==='oidc','verified OIDC identity provider is not configured'),
    check('database',databaseProvider==='postgres','PostgreSQL commercial database is not configured'),
    check('keyPepper',present(env.KATA_KEY_PEPPER),'key pepper is not configured'),
    check('billing',razorpayConfigured(env),'Razorpay live credentials/plan mappings are not configured'),
    check('webhook',razorpayWebhookConfigured(env),'Razorpay webhook secret is not configured'),
    check('legal',enabled(env.KATA_LEGAL_CONFIGURED),'legal identity/documents are not configured'),
    check('support',enabled(env.KATA_SUPPORT_CONFIGURED),'commercial support is not configured'),
    check('providerBudget',enabled(env.KATA_PROVIDER_BUDGET_CONFIGURED),'provider budget guard is not configured'),
    check('migrations',enabled(env.KATA_MIGRATIONS_CURRENT),'database migrations are not verified current'),
    check('releaseGovernance',enabled(env.KATA_RELEASE_GOVERNANCE_VERIFIED),'release governance is not verified')
  ];
  return{
    status:checks.every(item=>item.status==='ready')?'ready':'blocked',
    releaseSha:present(release.releaseSha)?release.releaseSha:null,
    sourceBound:Boolean(release.sourceBound),
    providers:{runtime:'vercel',identity:identityProvider,database:databaseProvider},
    implemented:{
      foundation:true,
      entitlements:true,
      usageMetering:true,
      billing:true,
      policyCi:true,
      platformAdapters:true,
      compatibilitySaas:false,
      commercialUx:false,
      trust:false,
      productionMigration:false
    },
    checks
  };
}
