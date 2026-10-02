import { REPO } from './paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
process.env.WC_PROVIDER='mock'; process.env.WC_SAVES=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-ord-'));
const repo=REPO + '/'; const im=(p)=>import(pathToFileURL(repo+p).href);
const game=await im('server/game.js');
const {id}=game.newGame('agot_298','stark',{seed:5});
const ORDERS=[
 'Raise 500 men at Winterfell','Send Robb to the Wall','Marry Sansa to Joffrey','Execute Theon Greyjoy','Declare war on House Lannister','Declare war on House Stark',
 'Send a raven to Tywin Lannister asking for peace','Lower taxes','Raise taxes to the maximum','Build a sept at Winterfell','Feed the poor','Hold a tourney at Winterfell',
 'Go to King\'s Landing','Travel to Dragonstone','Travel to Pentos','Send 100000 dragons to Robert','Buy grain from the Reach','Hire the Golden Company','Hire sellswords with 5 gold',
 'Dismiss Maester Luwin','Make Jon Snow my heir','Make Bran my heir','Disinherit Robb','Poison Tywin','Kill Joffrey','Ask Luwin about the Wall','',
 'asdfghjkl','Raise 0 men','Raise -5 men at Winterfell','Raise 99999999 men at Winterfell','Send Arya to Braavos','Betroth Arya to Tommen','Foster Rickon with the Umbers',
 'Go to Winterfell','Stay here','Wait','Fortify Moat Cailin','Call the banners','Call banners of the north and march on Riverrun','Release Jaime Lannister','Send Eddard to the Eyrie and hold a feast there',
];
const res=[]; 
for (const text of ORDERS.filter(Boolean)) {
  game.setOrders(id,[{id:'o1',text}]);
  let r; try { r=await game.previewOrderPlans(id); } catch(e){ res.push([text,'THREW '+e.message]); continue; }
  const o=r.orders[0]; res.push([text, JSON.stringify({receipt:o.receipt, p:o.parsed}).slice(0,600)]);
}
for (const [t,r] of res) console.log('>',t,'\n   ',r);
fs.rmSync(process.env.WC_SAVES,{recursive:true,force:true});
