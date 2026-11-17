import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { calculateChart, localToUtc, calculateFiveElements, threeDayForecast, ascendant, chartAngles, angularDistance, signIndex, degreeLabel } from './core.mjs';
import { layoutPlanetLabels } from './wheel.mjs';

// 在隔离上下文载入与网页相同的浏览器版本，避免测试另一套依赖。
const context = vm.createContext({Date,console});
vm.runInContext(readFileSync(new URL('./vendor/astronomy.browser.min.js',import.meta.url),'utf8'),context);
vm.runInContext(readFileSync(new URL('./vendor/lunar.js',import.meta.url),'utf8'),context);
globalThis.Astronomy = context.Astronomy;
globalThis.Solar = context.Solar;

assert.equal(localToUtc('2000-06-15','14:30','Asia/Shanghai').toISOString(),'2000-06-15T06:30:00.000Z');
assert.equal(localToUtc('2024-07-01','12:00','America/New_York').toISOString(),'2024-07-01T16:00:00.000Z');
assert.equal(localToUtc('2024-01-01','12:00','America/New_York').toISOString(),'2024-01-01T17:00:00.000Z');
assert.throws(()=>localToUtc('2024-03-10','02:30','America/New_York'),/跳时/);
assert.throws(()=>localToUtc('2024-11-03','01:30','America/New_York'),/重复/);
assert.throws(()=>localToUtc('2023-02-29','12:00','Asia/Shanghai'),/有效/);
assert.throws(()=>localToUtc('2000-06-15','14:30','Wrong/Zone'),/时区/);

const input = {date:'2000-06-15',time:'14:30',city:'0',latitude:31.2304,longitude:121.4737,timezone:'Asia/Shanghai',unknownTime:false};
const chart = calculateChart(input);
assert.equal(chart.sun.sign,2);
assert.equal(chart.planets.length,10);
assert.equal(chart.five.total,8);
assert.equal(Object.values(chart.five.counts).reduce((sum,value)=>sum+value,0),8);
assert.ok(chart.planets.every(planet=>Number.isFinite(planet.longitude)&&planet.longitude>=0&&planet.longitude<360&&planet.house>=1&&planet.house<=12));
const unknown = calculateChart({...input,unknownTime:true,time:''});
assert.equal(unknown.rising,null);
assert.equal(unknown.angles,null);
assert.ok(unknown.planets.every(planet=>planet.house===null));
assert.equal(unknown.five.columns[3].value,'待定');
assert.equal(Object.values(unknown.five.counts).reduce((sum,value)=>sum+value,0),6);
assert.throws(()=>calculateChart({...input,latitude:80}),/66/);
assert.throws(()=>calculateChart({...input,date:'2099-01-01'}),/晚于现在/);

// 使用天文学库的独立地平坐标变换，验证上升点确实位于东方地平线。
for (const [dateText,latitude,longitude] of [['2000-06-15T06:30:00Z',31.2304,121.4737],['2020-12-01T12:00:00Z',51.5074,-.1278],['1995-01-15T03:00:00Z',-33.8688,151.2093]]) {
  const date = new Date(dateText);
  const rising = ascendant(date,latitude,longitude);
  const tilt = 23.439291-.0130042*((date.getTime()/86400000+2440587.5-2451545)/36525);
  const longitudeRadians = rising*Math.PI/180;
  const tiltRadians = tilt*Math.PI/180;
  const ra = ((Math.atan2(Math.sin(longitudeRadians)*Math.cos(tiltRadians),Math.cos(longitudeRadians))*180/Math.PI+360)%360)/15;
  const dec = Math.asin(Math.sin(longitudeRadians)*Math.sin(tiltRadians))*180/Math.PI;
  const observer = new Astronomy.Observer(latitude,longitude,0);
  const horizon = Astronomy.Horizon(date,observer,ra,dec);
  assert.ok(Math.abs(horizon.altitude)<.04,`上升点高度异常: ${horizon.altitude}`);
  assert.ok(horizon.azimuth>0&&horizon.azimuth<180,`上升点未位于东方: ${horizon.azimuth}`);
  const axes=chartAngles(date,latitude,longitude);
  assert.ok(Math.abs(angularDistance(axes.asc,axes.dsc)-180)<1e-8);
  assert.ok(Math.abs(angularDistance(axes.mc,axes.ic)-180)<1e-8);
  const mcRadians=axes.mc*Math.PI/180;
  const mcRa=((Math.atan2(Math.sin(mcRadians)*Math.cos(tiltRadians),Math.cos(mcRadians))*180/Math.PI+360)%360);
  assert.ok(angularDistance(mcRa,(Astronomy.SiderealTime(date)*15+longitude+360)%360)<1e-8,'中天须位于当地子午圈');
}

// 立春前后的年柱应以节气切换，23:00 的日柱使用子正换日。
assert.equal(calculateFiveElements('2024-02-04','15:00',false).columns[0].value,'癸卯');
assert.equal(calculateFiveElements('2024-02-04','17:00',false).columns[0].value,'甲辰');
const newYorkAfterSpring = calculateChart({...input,date:'2024-02-04',time:'04:00',timezone:'America/New_York',latitude:40.7128,longitude:-74.006});
assert.equal(newYorkAfterSpring.five.columns[0].value,'甲辰');
assert.equal(newYorkAfterSpring.five.columns[1].value,'丙寅');
assert.equal(calculateFiveElements('2024-06-01','22:30',false).columns[2].value,calculateFiveElements('2024-06-01','23:30',false).columns[2].value);

const forecast = threeDayForecast(chart.sun.longitude,new Date('2026-11-16T23:00:00+08:00'));
assert.equal(forecast.length,3);
assert.equal(forecast[0].date.toISOString(),'2026-11-16T04:00:00.000Z');
assert.equal(forecast[2].date-forecast[0].date,172800000);
const rollover = threeDayForecast(chart.sun.longitude,new Date('2026-11-17T00:00:01+08:00'));
assert.equal(rollover[0].date.toISOString(),'2026-11-17T04:00:00.000Z');
assert.deepEqual(forecast,threeDayForecast(chart.sun.longitude,new Date('2026-11-16T23:00:00+08:00')));
assert.equal(angularDistance(359,1),2);
assert.equal(signIndex(360),0);
assert.equal(degreeLabel(29.999999),'29°59′');

// 重现旧版金星相位连续三天的案例，四类文案都必须分别生成。
const repeatedAspect=threeDayForecast(chart.sun.longitude,new Date('2026-11-17T12:00:00+08:00'));
assert.ok(repeatedAspect.every(day=>day.angle===120&&day.body==='Venus'));
for(const field of ['title','summary','love','career']) assert.equal(new Set(repeatedAspect.map(day=>day[field])).size,3,`连续三日 ${field} 重复`);
const tomorrowWindow=threeDayForecast(chart.sun.longitude,new Date('2026-11-18T12:00:00+08:00'));
assert.deepEqual(repeatedAspect[1],tomorrowWindow[0],'同一实际日期不应随窗口位置变化');

// 隔离星历，只控制行星黄经，覆盖五类持续相位及无紧密相位。
const originalAstronomy=globalThis.Astronomy;
try{
  for(const angle of [0,60,90,120,180,null]){
    const position=angle===null?25:angle===180?179.5:angle+.5;
    globalThis.Astronomy={...originalAstronomy,EclipticGeoMoon:()=>({lon:position}),GeoVector:()=>null,Ecliptic:()=>({elon:position})};
    const days=threeDayForecast(0,new Date('2026-11-17T12:00:00+08:00'));
    for(const field of ['title','summary','love','career']) assert.equal(new Set(days.map(day=>day[field])).size,3);
    assert.deepEqual(days[1],threeDayForecast(0,new Date('2026-11-18T12:00:00+08:00'))[0]);
    assert.ok(days.every(day=>angle===null?day.aspect.includes('未检出'):day.angle===angle));
  }
  globalThis.Astronomy={...originalAstronomy,EclipticGeoMoon:date=>({lon:[.5,90.5,179.5][new Date(date).getUTCDate()-17]}),GeoVector:()=>null,Ecliptic:()=>({elon:25})};
  assert.deepEqual(threeDayForecast(0,new Date('2026-11-17T12:00:00+08:00')).map(day=>day.angle),[0,90,180]);
}finally{globalThis.Astronomy=originalAstronomy;}

for(const positions of [chart.planets.map(planet=>planet.longitude),[359,1,0,2,358,4,355,6,3,7],Array(10).fill(0)]){
  const labels=layoutPlanetLabels(positions,0,[{x:66,y:240},{x:414,y:240},{x:240,y:66},{x:240,y:414}]);
  labels.forEach((label,index)=>{
    assert.equal(label.longitude,positions[index]);
    assert.ok(Math.abs(Math.hypot(label.dotX-240,label.dotY-240)-145)<1e-8,'行星真实点位被移动');
    for(const other of labels.slice(index+1)) assert.ok(Math.hypot(label.x-other.x,label.y-other.y)>=27,'星盘文字重叠');
  });
}
console.log('PASS：原有历法与星盘、真实四轴、三日完整文案去重、日期稳定、五类相位/无相位、跨日、星盘密集与零点标签避让。');
console.log('示例结果',JSON.stringify({sun:chart.sun.sign,moon:chart.moon.sign,rising:chart.rising,five:chart.five.columns}));
