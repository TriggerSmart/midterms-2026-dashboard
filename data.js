(function(root, factory){
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  root.MIDTERM_DATA = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  const fipsByCode = {
    AL:'01',AK:'02',AZ:'04',AR:'05',CA:'06',CO:'08',CT:'09',DE:'10',DC:'11',FL:'12',GA:'13',HI:'15',ID:'16',IL:'17',IN:'18',IA:'19',KS:'20',KY:'21',LA:'22',ME:'23',MD:'24',MA:'25',MI:'26',MN:'27',MS:'28',MO:'29',MT:'30',NE:'31',NV:'32',NH:'33',NJ:'34',NM:'35',NY:'36',NC:'37',ND:'38',OH:'39',OK:'40',OR:'41',PA:'42',RI:'44',SC:'45',SD:'46',TN:'47',TX:'48',UT:'49',VT:'50',VA:'51',WA:'53',WV:'54',WI:'55',WY:'56'
  };
  const states = [
    ['AK','Alaska',0,7],['HI','Hawaii',1,7],
    ['WA','Washington',0,1],['OR','Oregon',0,2],['CA','California',0,3],
    ['ID','Idaho',1,2],['NV','Nevada',1,3],['AZ','Arizona',1,4],
    ['MT','Montana',2,1],['WY','Wyoming',2,2],['UT','Utah',2,3],['NM','New Mexico',2,4],
    ['ND','North Dakota',3,1],['SD','South Dakota',3,2],['CO','Colorado',3,3],['TX','Texas',3,5],
    ['MN','Minnesota',4,1],['NE','Nebraska',4,3],['KS','Kansas',4,4],['OK','Oklahoma',4,5],
    ['IA','Iowa',5,2],['MO','Missouri',5,3],['AR','Arkansas',5,4],['LA','Louisiana',5,5],
    ['WI','Wisconsin',6,1],['IL','Illinois',6,2],['KY','Kentucky',6,3],['TN','Tennessee',6,4],['MS','Mississippi',6,5],
    ['MI','Michigan',7,1],['IN','Indiana',7,2],['OH','Ohio',7,3],['WV','West Virginia',7,4],['AL','Alabama',7,5],
    ['GA','Georgia',8,5],['FL','Florida',8,6],['SC','South Carolina',8,4],['NC','North Carolina',9,4],['VA','Virginia',9,3],
    ['PA','Pennsylvania',9,2],['NY','New York',10,1],['NJ','New Jersey',10,2],['MD','Maryland',10,3],['DE','Delaware',10,4],['DC','District of Columbia',10,5],
    ['VT','Vermont',11,0],['NH','New Hampshire',12,0],['MA','Massachusetts',12,1],['CT','Connecticut',11,2],['RI','Rhode Island',12,2],['ME','Maine',13,0]
  ].map(([code,name,col,row]) => ({code,name,col,row,fips:fipsByCode[code]}));

  const senateBattlegrounds = [
    {state:'AK', incumbent:'Daniel Sullivan', seat:'Regular', baseline:'R-held'},
    {state:'FL', incumbent:'Ashley Moody', seat:'Special', baseline:'R-held'},
    {state:'GA', incumbent:'Jon Ossoff', seat:'Regular', baseline:'D-held'},
    {state:'IA', incumbent:'Open', seat:'Regular', baseline:'R-held'},
    {state:'KS', incumbent:'Open/competitive', seat:'Regular', baseline:'R-held'},
    {state:'ME', incumbent:'Susan Collins', seat:'Regular', baseline:'R-held'},
    {state:'MI', incumbent:'Open', seat:'Regular', baseline:'D-held'},
    {state:'MT', incumbent:'Open', seat:'Regular', baseline:'R-held'},
    {state:'NE', incumbent:'Pete Ricketts', seat:'Regular', baseline:'R-held'},
    {state:'NH', incumbent:'Open', seat:'Regular', baseline:'D-held'},
    {state:'NC', incumbent:'Open', seat:'Regular', baseline:'R-held'},
    {state:'OH', incumbent:'Jon Husted', seat:'Special', baseline:'R-held'},
    {state:'TX', incumbent:'Open/competitive', seat:'Regular', baseline:'R-held'}
  ];

  const governorBattlegrounds = [
    ['AK','Jonathan Kreiss-Tomkins (D) / Republican top-four field'],
    ['AZ','Katie Hobbs (D) / Andy Biggs (R)'],
    ['CA','Xavier Becerra (D) / Steve Hilton (R)'],
    ['GA','Keisha Lance Bottoms (D) / Rick Jackson (R)'],
    ['IA','Rob Sand (D) / Zach Lahn (R)'],
    ['KS','Cindy Holscher (D) / Ty Masterson (R)'],
    ['MI','Jocelyn Benson (D) / John James (R)'],
    ['NV','Aaron Ford (D) / Joe Lombardo (R)'],
    ['OH','Amy Acton (D) / Vivek Ramaswamy (R)'],
    ['WI','David Crowley (D) / Tom Tiffany (R)']
  ].map(([state,matchup]) => ({state,matchup}));

  const houseTossups = ['FL-14','FL-22','IA-02','KY-06','ME-02','MI-04','MI-07','MI-10','MT-01','NC-01','NC-11','NY-17','OH-07','OH-09','PA-01','PA-08','TX-15','TX-35','VA-01'];

  const videoPresets = [
    {name:'ABC News Live', channelId:'UCBi2mrWuNuyYy4gbM6fU18Q', type:'channel', website:'https://abcnews.go.com/Live/'},
    {name:'NBC News NOW', channelId:'UCeY0bbntWzzVIaj2z3QigXg', type:'channel', website:'https://www.nbcnews.com/now'},
    {name:'CBS News 24/7', channelId:'UC8p1vwvWtl6T73JiExfWs1g', type:'channel', website:'https://www.cbsnews.com/live/'},
    {name:'Reuters', channelId:'UChqUTb7kYRX8-EiaN3XFrSQ', type:'channel', website:'https://www.reuters.com/world/us/'},
    {name:'PBS NewsHour', channelId:'UC6ZFN9Tx6xh-skXCuRHCDpQ', type:'channel', website:'https://www.pbs.org/newshour/'},
    {name:'C-SPAN', channelId:'UCb--64Gl51jIEVE-GLDAVTg', type:'channel', website:'https://www.c-span.org/'},
    {name:'Fox News', channelId:'UCXIJgqnII2ZOINSWNOGFThA', type:'channel', website:'https://www.foxnews.com/'},
    {name:'Sky News', channelId:'UCoMdktPbSTixAyNGwb-UYkQ', type:'channel', website:'https://news.sky.com/us'}
  ];

  const sources = [
    {name:'watch.vote — 2026 live results API', category:'Live Data', url:'https://watch.vote/docs/api-reference/elections', note:'Built-in automatic source. Keyless 2026 Senate, House and governor results read from official state counts; calls only when licensed/certified.'},
    {name:'Open America — official-state results API', category:'Live Data', url:'https://openamerica.io/elections/api/', note:'Built-in automatic cross-check. Free keyless JSON sourced from official state election feeds where adapters are available.'},
    {name:'civicAPI — free realtime election API', category:'Live Data', url:'https://civicapi.org/api-documentation', note:'Free keyless realtime election results and calls; included as an external verification/fallback source with attribution.'},
    {name:'Decision Desk HQ — Nov. 3 results', category:'Credentialed / Web', url:'https://votes.decisiondeskhq.com/elections/2026-11-03', note:'Web results reference. DDHQ API results require OAuth/Bearer credentials; the dashboard does not depend on it.'},
    {name:'Decision Desk HQ — 2026 forecasts', category:'Forecast', url:'https://votes.decisiondeskhq.com/', note:'House, Senate and governor forecast models.'},
    {name:'Associated Press Elections', category:'Credentialed / Web', url:'https://apnews.com/hub/election-2026', note:'AP election coverage and race calls. API access requires credentials.'},
    {name:'AP Elections API docs', category:'Data', url:'https://developer.ap.org/ap-elections-api/', note:'Authenticated election data integration reference; AP requires an API key/credentials.'},
    {name:'Ballotpedia — 2026 elections', category:'Reference', url:'https://ballotpedia.org/Elections', note:'Candidates, battlegrounds, ballot measures and election administration.'},
    {name:'Cook Political Report ratings', category:'Forecast', url:'https://www.cookpolitical.com/ratings', note:'Continuously updated House, Senate and governor ratings.'},
    {name:"Sabato's Crystal Ball", category:'Forecast', url:'https://centerforpolitics.org/crystalball/', note:'Race ratings and election analysis.'},
    {name:'270toWin — 2026 House', category:'Map', url:'https://www.270towin.com/2026-house-election/', note:'Interactive House forecast maps and rating comparisons.'},
    {name:'USA.gov — Midterm elections', category:'Official', url:'https://www.usa.gov/midterm-elections', note:'Federal overview and links to state election information.'},
    {name:'NASS — State election officials', category:'Official', url:'https://www.nass.org/can-I-vote/election-officials', note:'Directory of state election officials for official results.'},
    {name:'FEC — Election information', category:'Official', url:'https://www.fec.gov/introduction-campaign-finance/election-results-and-voting-information/', note:'Federal election information and historical results.'},
    {name:'Google News — 2026 midterms', category:'News', url:'https://news.google.com/search?q=2026%20midterm%20elections&hl=en-US&gl=US&ceid=US%3Aen', note:'Cross-outlet headline search.'},
    {name:'Reuters — U.S. politics', category:'News', url:'https://www.reuters.com/world/us/', note:'National breaking-news coverage.'},
    {name:'PBS NewsHour — Politics', category:'News', url:'https://www.pbs.org/newshour/politics', note:'Politics and election reporting.'}
  ];

  const pollCloseET = [
    {at:'2026-11-03T18:00:00-05:00', label:'6:00 PM ET', states:['IN*','KY*'], note:'First portions of Indiana and Kentucky.'},
    {at:'2026-11-03T19:00:00-05:00', label:'7:00 PM ET', states:['FL*','GA','IN*','KY*','NH*','SC','VT','VA'], note:'Includes split-zone/variable-close states marked *.'},
    {at:'2026-11-03T19:30:00-05:00', label:'7:30 PM ET', states:['NC','OH','WV']},
    {at:'2026-11-03T20:00:00-05:00', label:'8:00 PM ET', states:['AL','CT','DE','DC','FL*','IL','KS*','ME','MD','MA','MI*','MS','MO','NH*','NJ','ND*','OK','PA','RI','SD*','TN','TX*']},
    {at:'2026-11-03T20:30:00-05:00', label:'8:30 PM ET', states:['AR']},
    {at:'2026-11-03T21:00:00-05:00', label:'9:00 PM ET', states:['AZ','CO','IA','KS*','LA','MI*','MN','NE','NM','NY','ND*','SD*','TX*','WI','WY']},
    {at:'2026-11-03T22:00:00-05:00', label:'10:00 PM ET', states:['ID*','MT','NV','OR*','UT']},
    {at:'2026-11-03T23:00:00-05:00', label:'11:00 PM ET', states:['CA','ID*','OR*','WA']},
    {at:'2026-11-04T00:00:00-05:00', label:'12:00 AM ET', states:['AK*','HI']},
    {at:'2026-11-04T01:00:00-05:00', label:'1:00 AM ET', states:['AK*'], note:'Western Aleutians.'}
  ];

  return {
    electionDate:'2026-11-03',
    electionName:'2026 U.S. Midterm Elections',
    houseSeatsUp:435,
    senateSeatsUp:35,
    governorRaces:36,
    startingControl:{
      house:{rep:219,dem:214,other:0,vacant:2,majority:218},
      senate:{rep:53,dem:45,other:2,vacant:0,majority:51}
    },
    states, senateBattlegrounds, governorBattlegrounds, houseTossups,
    videoPresets, sources, pollCloseET,
    defaultHeadlines:[
      {title:'Projection dashboard is loaded now; switch the same map to Live Results when counting begins.', link:'#map'},
      {title:'Automatic election feeds are armed: watch.vote + Open America require no API key or setup.', link:'#data'},
      {title:'Use Source Center to open AP, DDHQ, Ballotpedia, Cook, official state election offices and network coverage.', link:'#sources'},
      {title:'Video windows persist while you move between Dashboard, Map, Races, Sources and Data pages.', link:'#videos'}
    ]
  };
});
