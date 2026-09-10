function enabled(value){return String(value||'').trim().toLowerCase()==='true';}
function present(value){return typeof value==='string'&&value.trim().length>0;}
function check(name,ready,reason){return{name,status:ready?'ready':'blocked',...(ready?{}:{reason})};}

export function evaluateCommercialReadiness({env=process.env,release={}}={}){
  const checks=[
    check('release',Boolean(release.sourceBound&&present(release.releaseSha)),'source-bound release evidence missing'),
    check('identity',enabled(env.KATA_IDENTITY_CONFIGURED),'Identity is not configured'),
    check('database',enabled(env.KATA_DATABASE_CONFIGURED),'commercial database is not configured'),
    check('keyPepper',present(env.KATA_KEY_PEPPER),'key pepper is not configured'),
    check('billing',enabled(env.KATA_BILLING_CONFIGURED),'billing is not implemented/configured'),
    check('webhook',enabled(env.KATA_WEBHOOK_CONFIGURED),'billing webhook is not implemented/configured'),
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
    implemented:{foundation:true,billing:false,compatibilitySaas:false,commercialUx:false,trust:false,productionMigration:false},
    checks
  };
}
