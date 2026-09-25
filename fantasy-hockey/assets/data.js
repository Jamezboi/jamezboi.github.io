window.HOCKEY_DEMO = {
  teams: [
    {id:'JST',owner:'Justin Delisle',name:"Justin's Scary Team"},
    {id:'MMT',owner:'Matei Marinoiu',name:'Mutai'},
    {id:'NNT',owner:'Nicolas St-Louis',name:"Nicolas's Nifty Team"},
    {id:'JL',owner:'Unknown',name:'Team JLali'}
  ],
  players: [
    [1,'JST','Nathan MacKinnon','COL','C','F','Healthy',53,80,367],
    [2,'JST','Leon Draisaitl','EDM','C','F','Healthy',39,69,215],
    [3,'JST','Jason Robertson','DAL','LW','F','Healthy',42,50,282],
    [4,'JST','Matt Boldy','MIN','LW','F','Healthy',42,44,267],
    [5,'JST','Mitch Marner','VGK','RW','F','Healthy',27,60,177],
    [6,'JST','Martin Necas','COL','C','F','Healthy',36,61,207],
    [7,'JST','Jake Guentzel','TB','LW','F','Healthy',39,51,236],
    [8,'JST','Alex Tuch','WSH','RW','F','Healthy',33,38,263],
    [9,'JST','Mika Zibanejad','NYR','C','F','Healthy',34,46,218],
    [10,'JST','Zach Werenski','CBJ','D','D','Healthy',22,61,258],
    [11,'JST','Jakob Chychrun','WSH','D','D','Healthy',24,33,214],
    [12,'JST','MacKenzie Weegar','UTA','D','D','Healthy',7,31,180],
    [13,'JST','John Carlson','TB','D','D','Healthy',17,43,179],
    [14,'JST','Thomas Chabot','OTT','D','D','Healthy',10,35,157],
    [15,'JST','Alex Ovechkin','WSH','LW','UTIL','O',32,50,181],
    [16,'JST','Mark Scheifele','WPG','C','Bench','Healthy',35,64,177],
    [17,'JST','Miro Heiskanen','DAL','D','Bench','Healthy',9,51,143],
    [18,'JST','Nazem Kadri','COL','C','Bench','Healthy',22,38,241],
    [19,'JST','Tom Wilson','WSH','RW','Bench','Healthy',31,31,159],
    [20,'JST','Sidney Crosby','PIT','C','Bench','Healthy',35,55,200],
    [21,'JST','Scott Wedgewood','COL','G','G','Healthy',0,0,0],
    [22,'JST','Brandon Bussi','CAR','G','G','Healthy',0,0,0],
    [30,'MMT','Connor McDavid','EDM','C','F','Healthy',60,90,350],
    [31,'MMT','Jack Hughes','NJD','C','F','Healthy',45,55,290],
    [32,'MMT','William Nylander','TOR','RW','F','Healthy',40,50,280],
    [33,'MMT','Brady Tkachuk','OTT','LW','F','Healthy',35,40,320],
    [34,'MMT','Quinn Hughes','VAN','D','D','Healthy',15,75,200],
    [35,'MMT','Rasmus Dahlin','BUF','D','D','Healthy',20,50,220],
    [36,'MMT','Igor Shesterkin','NYR','G','G','Healthy',0,0,0],
    [37,'MMT','Tage Thompson','BUF','C','Bench','Healthy',45,40,270],
    [38,'MMT','Sergei Bobrovsky','FLA','G','Bench','Healthy',0,0,0],
    [50,'NNT','Auston Matthews','TOR','C','F','Healthy',65,45,360],
    [51,'NNT','Matthew Tkachuk','FLA','RW','F','Healthy',40,60,280],
    [52,'NNT','Elias Pettersson','VAN','C','F','Healthy',40,65,250],
    [53,'NNT','Cale Makar','COL','D','D','Healthy',25,65,240],
    [54,'NNT','Adam Fox','NYR','D','D','Healthy',15,60,180],
    [55,'NNT','Thatcher Demko','VAN','G','G','DTD',0,0,0],
    [56,'NNT','Juuse Saros','NSH','G','G','Healthy',0,0,0],
    [70,'JL','David Pastrnak','BOS','RW','F','Healthy',55,55,340],
    [71,'JL','Kirill Kaprizov','MIN','LW','F','Healthy',45,50,290],
    [72,'JL','Roman Josi','NSH','D','D','Healthy',20,65,260],
    [73,'JL','Evan Bouchard','EDM','D','D','Healthy',22,60,230],
    [74,'JL','Connor Hellebuyck','WPG','G','G','Healthy',0,0,0],
    [75,'JL','Jack Eichel','VGK','C','Bench','Healthy',35,50,270]
  ]
};
window.HOCKEY_DEMO.players = window.HOCKEY_DEMO.players.map(function(r){
  var id=r[0],fid=r[1],name=r[2],team=r[3],pos=r[4],slot=r[5],status=r[6],g=r[7],a=r[8],sog=r[9];
  var projection=pos==='G'?70:Math.round((g*2.7+a*1.8+sog*.12)*10)/10;
  var avs=pos==='G'?75:Math.min(99.9,Math.max(1,Math.round(projection*.82*10)/10));
  var tier=avs>=90?'Elite':avs>=80?'All-Star':avs>=70?'Starter':avs>=60?'Streamer':'Bench/Drop';
  return {espn_id:id,fantasy_team_id:fid,fantasy_team_name:'',fantasy_owner:'',name:name,team:team,position:pos,slot:slot,status:status,projection:projection,ai_value_score:avs,ai_tier:tier,has_game_today:false,opponent:'',game_time:'',stats:{goals:g,assists:a,sog:sog,points:g+a}};
});
(function(){
  var meta={};window.HOCKEY_DEMO.teams.forEach(function(t){meta[t.id]=t});
  window.HOCKEY_DEMO.players.forEach(function(p){p.fantasy_team_name=meta[p.fantasy_team_id].name;p.fantasy_owner=meta[p.fantasy_team_id].owner});
})();