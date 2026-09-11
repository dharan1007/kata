const INTAKE_URL='https://tally.so/r/xXAa0J';
const SERVICES_PATH='/services.html';

function validHttps(value){
  try{return new URL(value).protocol==='https:';}catch{return false;}
}

async function loadConfig(){
  try{
    const response=await fetch('/commercial-config.json',{cache:'no-store',credentials:'omit'});
    if(!response.ok)return null;
    const data=await response.json();
    return data&&typeof data==='object'?data:null;
  }catch{return null;}
}

function mountProductCta(){
  if(location.pathname===SERVICES_PATH||document.getElementById('kata-commercial-cta'))return;
  const link=document.createElement('a');
  link.id='kata-commercial-cta';
  link.href=SERVICES_PATH;
  link.textContent='Implementation services';
  link.setAttribute('aria-label','KATA paid workflow implementation services');
  Object.assign(link.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:'9999',padding:'10px 14px',borderRadius:'999px',background:'#111827',color:'#fff',textDecoration:'none',font:'600 13px system-ui,sans-serif',boxShadow:'0 8px 28px rgba(0,0,0,.24)'});
  document.body.append(link);
}

async function mountServices(){
  const intake=document.querySelector('[data-commercial-intake]');
  if(intake)intake.href=INTAKE_URL;
  const payment=document.querySelector('[data-commercial-payment]');
  if(!payment)return;
  payment.setAttribute('aria-disabled','true');
  payment.textContent='Payment link issued after acceptance';
  const config=await loadConfig();
  if(!config||!validHttps(config.paymentUrl))return;
  payment.href=config.paymentUrl;
  payment.target='_blank';
  payment.rel='noopener noreferrer';
  payment.removeAttribute('aria-disabled');
  payment.textContent=`Pay securely${config.provider?` with ${config.provider}`:''}`;
}

function mount(){mountProductCta();void mountServices();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
