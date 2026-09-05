import {createApp} from './app.js';
const root=document.getElementById('app');
const app=createApp(root);window.addEventListener('beforeunload',()=>app.dispose(),{once:true});
