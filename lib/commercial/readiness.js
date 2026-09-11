function enabled(value){return String(value||'').trim().toLowerCase()==='true';}
function present(value){return typeof value==='string'&&value.trim().length>0;}
function check(name,ready,reason){return{name,status:ready?'ready':'blocked',...(ready?{}:{reason})};}

function razorpayConfigured(env){
  return present(env.KATA_RAZORPAY_KEY_ID)&&present(env.KATA_RAZORPAY_KEY_SECRET)&&present(env.KATA_RAZORPAY_DEVELOPER_PLAN_ID)&&present(env.KATA_RAZORPAY_TEAM_PLAN_ID);
}
function razorpayWebhookConfigured(env){
  return present(env.KATA_RAZORPAY_WEBHOOK_SECRET);
}

export function evaluateCommercialReadiness({env=process.env,release={}}={}){
  const checks=[
    check('release',Boolean(release.sourceBound&&present(release.releaseSha)),'source-bound release evidence missing'),
    check('identity',enabled(env.KATA_IDENTITY_CONFIGURED),'Identity is not configured'),
    check('database',enabled(env.KATA_DATABASE_CONFIGURED),'commercial database is not configured'),
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
    implemented:{
      foundation:true,
      entitlements:true,
      usageMetering:true,
      billing:true,
      policyCi:true,
      compatibilitySaas:false,
      commercialUx:false,
      trust:false,
      productionMigration:false
    },
    checks
  };
}
