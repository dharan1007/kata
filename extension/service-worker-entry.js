import './service-worker.js';
import {createSessionController} from './session-controller.js';

const chromeApi=globalThis.chrome;
const controller=chromeApi?.storage?.session?createSessionController({storageArea:chromeApi.storage.session,cryptoImpl:globalThis.crypto,fetchImpl:globalThis.fetch,chromeApi}):null;

async function activeTab(){const tabs=await chromeApi.tabs.query({active:true,currentWindow:true});const tab=tabs?.[0];if(!tab)throw new Error('No active tab is available.');return tab;}

if(controller&&chromeApi?.runtime?.onMessage){
  chromeApi.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
    if(!message?.type?.startsWith('session-'))return false;
    activeTab().then(tab=>controller.handle(message,tab)).then(sendResponse,error=>sendResponse({ok:false,error:String(error?.message??error)}));
    return true;
  });
}

export{controller};
