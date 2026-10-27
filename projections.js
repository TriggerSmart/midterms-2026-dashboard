(function(root, factory){
  const data=factory();
  if(typeof module==='object'&&module.exports) module.exports=data;
  root.MIDTERM_PROJECTIONS=data;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const ratingStrength=Object.freeze({
    'Solid D':0.95,'Likely D':0.78,'Lean D':0.63,'Toss Up':0.50,
    'Lean R':0.63,'Likely R':0.78,'Solid R':0.95
  });
  const partyFromRating=rating=>/ D$/.test(rating)?'D':/ R$/.test(rating)?'R':'U';
  const normalizeDistrictKey=raw=>{
    const m=String(raw).toUpperCase().match(/^([A-Z]{2})-(AL|\d{1,2})$/);
    if(!m)return String(raw).toUpperCase();
    return `${m[1]}-${m[2]==='AL'?'00':m[2].padStart(2,'0')}`;
  };
  const rec=(rating,extra={})=>Object.freeze({rating,party:partyFromRating(rating),strength:ratingStrength[rating]||0.5,...extra});

  const senate={};
  const addSenate=(rating,rows)=>rows.forEach(([state,incumbent,extra={}])=>{senate[state]=rec(rating,{state,incumbent,...extra});});
  addSenate('Solid D',[
    ['CO','John Hickenlooper'],['DE','Chris Coons'],['IL','Open seat'],['MA','Ed Markey'],['NJ','Cory Booker'],['NM','Ben Ray Luján'],['OR','Jeff Merkley'],['RI','Jack Reed'],['VA','Mark Warner']
  ]);
  addSenate('Likely D', [['GA','Jon Ossoff'],['NC','Open seat']]);
  addSenate('Lean D', [['MN','Open seat'],['NH','Open seat']]);
  addSenate('Toss Up', [
    ['AK','Dan Sullivan'],['IA','Open seat'],['KS','Roger Marshall'],['ME','Susan Collins'],['MI','Open seat'],['OH','Jon Husted',{special:true}],['TX','Open seat']
  ]);
  addSenate('Lean R', [['SC','Lindsey Graham']]);
  addSenate('Likely R', [['MS','Cindy Hyde-Smith'],['NE','Pete Ricketts']]);
  addSenate('Solid R', [
    ['AL','Open seat'],['AR','Tom Cotton'],['FL','Ashley Moody',{special:true}],['ID','Jim Risch'],['KY','Open seat'],['LA','Open seat'],['MT','Open seat'],['OK','Open seat'],['SD','Mike Rounds'],['TN','Bill Hagerty'],['WV','Shelley Moore Capito'],['WY','Open seat']
  ]);

  const governor={};
  const addGovernor=(rating,rows)=>rows.forEach(([state,incumbent,matchup=''])=>{governor[state]=rec(rating,{state,incumbent,matchup});});
  addGovernor('Solid D',[
    ['CA','Open seat'],['CO','Open seat'],['CT','Ned Lamont'],['HI','Josh Green'],['IL','JB Pritzker'],['MA','Maura Healey'],['MD','Wes Moore'],['ME','Open seat'],['MN','Open seat'],['NM','Open seat'],['NY','Kathy Hochul'],['PA','Josh Shapiro'],['RI','Open seat']
  ]);
  addGovernor('Lean D',[
    ['AK','Open seat','Jonathan Kreiss-Tomkins (D) / Republican field'],['AZ','Katie Hobbs','Katie Hobbs (D) / Andy Biggs (R)'],['IA','Open seat','Rob Sand (D) / Zach Lahn (R)'],['MI','Open seat','Jocelyn Benson (D) / John James (R)'],['OH','Open seat','Amy Acton (D) / Vivek Ramaswamy (R)'],['OR','Tina Kotek']
  ]);
  addGovernor('Toss Up',[
    ['GA','Open seat','Keisha Lance Bottoms (D) / Rick Jackson (R)'],['NV','Joe Lombardo','Aaron Ford (D) / Joe Lombardo (R)'],['WI','Open seat','David Crowley (D) / Tom Tiffany (R)']
  ]);
  addGovernor('Lean R',[
    ['FL','Open seat','David Jolly (D) / Byron Donalds (R)'],['KS','Open seat','Cindy Holscher (D) / Ty Masterson (R)'],['TX','Greg Abbott']
  ]);
  addGovernor('Likely R', [['NE','Jim Pillen'],['NH','Kelly Ayotte'],['OK','Open seat'],['VT','Phil Scott']]);
  addGovernor('Solid R', [['AL','Open seat'],['AR','Sarah Huckabee Sanders'],['ID','Brad Little'],['SC','Open seat'],['SD','Larry Rhoden'],['TN','Open seat'],['WY','Open seat']]);

  const houseCompetitive={};
  const addHouse=(rating,rows)=>rows.forEach(([raw,incumbent])=>{
    const key=normalizeDistrictKey(raw);
    houseCompetitive[key]=rec(rating,{key,displayKey:raw,incumbent:incumbent||'Open seat'});
  });
  addHouse('Likely D',[
    ['AZ-6','Ciscomani'],['CA-6','Kiley'],['CA-13','Gray'],['CA-45','Tran'],['CA-48','OPEN'],['IN-1','Mrvan'],['MI-8','McDonald Rivet'],['MN-2','OPEN'],['NE-2','OPEN'],['NH-1','OPEN'],['NH-2','Goodlander'],['NJ-9','Pou'],['NM-2','Vasquez'],['NV-1','Titus'],['NV-3','Lee'],['NV-4','Horsford'],['NY-3','Suozzi'],['NY-4','Gillen'],['NY-19','Riley'],['OH-1','Landsman'],['OH-13','Sykes'],['TX-28','Cuellar'],['VA-7','Vindman']
  ]);
  addHouse('Lean D',[
    ['AZ-1','OPEN'],['CA-22','Valadao'],['CO-8','Evans'],['FL-25','Moskowitz'],['IA-1','Miller-Meeks'],['IA-3','Nunn'],['NJ-7','Kean'],['PA-7','Mackenzie'],['PA-10','Perry'],['TX-34','Gonzalez'],['VA-2','Kiggans'],['WA-3','Perez'],['WI-3','Van Orden']
  ]);
  addHouse('Toss Up',[
    ['FL-14','Castor'],['FL-22','OPEN'],['IA-2','OPEN'],['KY-6','OPEN'],['ME-2','OPEN'],['MI-4','Huizenga'],['MI-7','Barrett'],['MI-10','OPEN'],['MT-1','OPEN'],['NC-1','Davis'],['NC-11','Edwards'],['NY-17','Lawler'],['OH-7','Miller'],['OH-9','Kaptur'],['PA-1','Fitzpatrick'],['PA-8','Bresnahan'],['TX-15','De La Cruz'],['TX-35','OPEN (Casar)'],['VA-1','Wittman']
  ]);
  addHouse('Lean R',[
    ['AL-2','Figures'],['AZ-2','Crane'],['CO-3','Hurd'],['CO-5','Crank'],['FL-7','OPEN'],['FL-13','Luna'],['FL-27','Salazar'],['MN-1','Finstad'],['NV-2','OPEN'],['OH-15','Carey'],['SC-1','OPEN'],['TX-23','OPEN'],['VA-5','McGuire'],['WI-1','Steil']
  ]);
  addHouse('Likely R',[
    ['AK-AL','Begich'],['AR-2','Hill'],['AZ-8','Hamadeh'],['CO-4','Boebert'],['FL-4','Bean'],['FL-9','Soto'],['FL-16','OPEN'],['IN-5','Spartz'],['KS-2','Schmidt'],['MO-2','Wagner'],['NC-3','Murphy'],['NC-9','Hudson'],['NC-13','Knott'],['NE-1','Flood'],['NJ-2','Van Drew'],['NY-1','LaLota'],['NY-21','OPEN'],['OH-10','Turner'],['TX-9','OPEN'],['WA-5','Baumgartner']
  ]);

  return Object.freeze({
    meta:Object.freeze({
      asOf:'2026-10-23',
      note:'Projection ratings are forecasts, not vote counts or race calls.',
      houseSource:Object.freeze({name:'270toWin 2026 House Consensus Forecast',url:'https://www.270towin.com/2026-house-election/consensus-2026-house-forecast',detail:'Consensus of seven forecasters; non-safe district table updated Oct. 23, 2026.'}),
      senateSource:Object.freeze({name:'Cook Political Report 2026 Senate Ratings',url:'https://www.cookpolitical.com/ratings/senate-race-ratings',detail:'Cook ratings updated Oct. 20, 2026.'}),
      governorSource:Object.freeze({name:'Cook Political Report 2026 Governor Ratings',url:'https://www.cookpolitical.com/ratings/governor-race-ratings',detail:'Cook ratings updated Oct. 23, 2026.'}),
      consensusSource:Object.freeze({name:'270toWin 2026 Consensus',url:'https://www.270towin.com/2026-election-forecast-predictions/'})
    }),
    summary:Object.freeze({
      house:Object.freeze({dem:220,rep:196,tossup:19,total:435,majority:218}),
      senate:Object.freeze({demCaucus:49,dem:47,ind:2,rep:46,tossup:5,total:100,majority:51}),
      governor:Object.freeze({dem:23,rep:22,tossup:5,total:50})
    }),
    controlForecast:Object.freeze({
      asOf:'2026-10-26T14:42:00-04:00',
      source:Object.freeze({name:'Decision Desk HQ 2026 Forecast',url:'https://votes.decisiondeskhq.com/forecast/2026'}),
      house:Object.freeze({favored:'D',demProbability:79,repProbability:21,projectedDemSeats:238,projectedRepSeats:197,majority:218,label:'Projected Democratic Control'}),
      senate:Object.freeze({favored:'D',demProbability:57,repProbability:43,projectedDemSeats:51,projectedRepSeats:49,majority:51,label:'Projected Democratic Control'})
    }),
    ratingStrength,
    senate:Object.freeze(senate),
    governor:Object.freeze(governor),
    houseCompetitive:Object.freeze(houseCompetitive),
    normalizeDistrictKey
  });
});
