process.env.WC_PROVIDER='mock';
const { createInitialState } = await import('/home/user/wc-s4/public/js/shared/world.js');
const { scoreCard } = await import('/home/user/wc-s4/server/ai/validate/headline.js');
const s = createInitialState('agot_298','stark',{seed:7});
const mk=(kind,o)=>({id:'f1.1',turn:1,day:107493,kind,actors:o.actors||[],houses:o.houses||[],...(o.place?{place:o.place}:{}),...(o.data?{data:o.data}:{}),importance:o.importance||3,text:'x'});
const tests=[
 ['betrothal',{actors:['joffrey_baratheon','sansa_stark'],houses:['baratheon','stark'],data:{pact:'p1',type:'marriage'}},'Joffrey Baratheon is promised to Sansa Stark','The match joins the Crown and House Stark.'],
 ['office_granted',{actors:['eddard_stark','robert_baratheon'],houses:['stark','baratheon'],data:{office:'hand',title:'Hand of the King'}},'Eddard Stark is named Hand of the King','He takes up the duties of the office.'],
 ['sellswords_turned',{actors:[],houses:['lannister','baratheon'],data:{party:'golden_company_host',from:'baratheon',to:'lannister',price:5000}},'House Lannister buys sellswords away from the Crown','They go to the higher bidder, at thousands of dragons.'],
 ['tourney_result',{actors:['cortnay_penrose'],houses:['baratheon','baratheon_se'],place:'baratheon'},"Ser Cortnay Penrose takes the tourney prize at King's Landing",'He rides for the Crown.'],
 ['canon_beat',{actors:['robert_baratheon'],houses:['baratheon','stark'],place:'frey',data:{stage:'progress'}},'King Robert takes the road to Winterfell at the Twins','The progress is bound for Winterfell, and the whole realm watches it pass.'],
];
for (const [k,o,h,su] of tests){ const f=mk(k,o); const v=scoreCard({headline:h,summary:su},{id:'S1',facts:[f],actors:o.actors,houses:o.houses,place:o.place},s); console.log(k, v.pass, JSON.stringify(v.detail)); }
