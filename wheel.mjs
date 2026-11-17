import { signs } from './data.mjs';
import { angularDistance, signIndex } from './core.mjs?v=2';

const center = 240;
const palette = {火:'#ee6670',土:'#d4aa70',风:'#48c4a1',水:'#529fe3'};
const shortSigns = ['羊','牛','双','蟹','狮','处','秤','蝎','射','摩','瓶','鱼'];
const planetStyles = {
  Sun:['日','#f07172'],Moon:['月','#65a9ec'],Mercury:['水','#4bd1a4'],Venus:['金','#dab77d'],
  Mars:['火','#f07172'],Jupiter:['木','#e17f70'],Saturn:['土','#c3a272'],
  Uranus:['天','#4bd1a4'],Neptune:['海','#65a9ec'],Pluto:['冥','#bb98ea'],
};

function point(longitude, radius, rotation) {
  const angle = (180-(longitude-rotation))*Math.PI/180;
  return {x:center+Math.cos(angle)*radius,y:center+Math.sin(angle)*radius};
}

export function layoutPlanetLabels(longitudes, rotation, blocked = []) {
  const occupied = [...blocked];
  const offsets = [0];
  for (let offset=7;offset<=84;offset+=7) offsets.push(-offset,offset);
  // 只移动文字；行星点始终保持原始黄经。圆周距离也能自然处理 359° / 1° 的拥挤。
  return longitudes.map(longitude=>{
    const candidates = [164,134,104,74].flatMap(radius=>offsets.map(offset=>({
      ...point(longitude+offset,radius,rotation),cost:Math.abs(offset)*.65+Math.abs(164-radius)*.35,
    }))).sort((first,second)=>first.cost-second.cost);
    const label = candidates.find(candidate=>occupied.every(other=>Math.hypot(candidate.x-other.x,candidate.y-other.y)>=27));
    if (!label) throw new Error('星盘标签布局空间不足。');
    occupied.push(label);
    const dot = point(longitude,145,rotation);
    return {...label,dotX:dot.x,dotY:dot.y,longitude};
  });
}

export function renderChartSvg(chart) {
  const rotation = chart.rising ?? 0;
  const line = (longitude,inner,outer,color,width=1)=>{
    const first=point(longitude,inner,rotation);
    const second=point(longitude,outer,rotation);
    return `<line x1="${first.x}" y1="${first.y}" x2="${second.x}" y2="${second.y}" stroke="${color}" stroke-width="${width}"/>`;
  };
  const bits = [
    '<svg viewBox="0 0 480 480" role="img" aria-labelledby="wheel-title wheel-description">',
    '<title id="wheel-title">本命星盘</title><desc id="wheel-description">黑底星盘，外圈十二星座，中圈整宫制宫位，内圈十颗行星及相位。点击行星简称查看详细位置。</desc>',
    '<circle cx="240" cy="240" r="234" fill="#070809" stroke="#55595c" stroke-width="1.2"/>',
    '<circle cx="240" cy="240" r="210" fill="#17191b" stroke="#292c2e"/>',
    '<circle cx="240" cy="240" r="186" fill="#070809" stroke="#292c2e"/>',
  ];
  for (let index=0;index<360;index+=5) bits.push(line(index,index%30===0?210:230,234,'#747778',index%30===0?1.1:.5));
  signs.forEach((sign,index)=>{
    const label=point(index*30+15,222,rotation);
    bits.push(`<text x="${label.x}" y="${label.y}" class="sign-label" fill="${palette[sign.element]}">${shortSigns[index]}<title>${sign.name}</title></text>`);
    if(chart.rising!==null){
      bits.push(line(index*30,0,210,'#555b5e',.85));
      const house=(index-signIndex(chart.rising)+12)%12+1;
      const housePoint=point(index*30+15,198,rotation);
      bits.push(`<text x="${housePoint.x}" y="${housePoint.y}" class="house-label" fill="${palette[sign.element]}">${house}</text>`);
    }
  });
  const axes = chart.angles ? [
    {label:'升',value:chart.angles.asc,color:'#f07172'},
    {label:'降',value:chart.angles.dsc,color:'#f07172'},
    {label:'顶',value:chart.angles.mc,color:'#d4aa70'},
    {label:'底',value:chart.angles.ic,color:'#d4aa70'},
  ] : [];
  for(const axis of axes) bits.push(line(axis.value,0,233,'#95999a',1.6));
  for(let first=0;first<chart.planets.length;first++) for(let second=first+1;second<chart.planets.length;second++){
    const a=chart.planets[first];
    const b=chart.planets[second];
    const distance=angularDistance(a.longitude,b.longitude);
    const aspect=[{angle:60,color:'#43cbaa'},{angle:90,color:'#e86873'},{angle:120,color:'#568ee9'},{angle:180,color:'#e86873'}].find(rule=>Math.abs(distance-rule.angle)<4);
    if(aspect){
      const start=point(a.longitude,145,rotation);
      const end=point(b.longitude,145,rotation);
      bits.push(`<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="${aspect.color}" stroke-width=".9" opacity=".88"/>`);
    }
  }
  const axisPositions=axes.map(axis=>point(axis.value,174,rotation));
  axes.forEach((axis,index)=>{
    bits.push(`<text x="${axisPositions[index].x}" y="${axisPositions[index].y}" class="axis-label" fill="${axis.color}">${axis.label}</text>`);
  });
  const labels=layoutPlanetLabels(chart.planets.map(planet=>planet.longitude),rotation,axisPositions);
  chart.planets.forEach((planet,index)=>{
    const label=labels[index];
    const [shortName,color]=planetStyles[planet.body];
    bits.push(`<g class="chart-planet" data-planet="${index}" data-label-x="${label.x}" data-label-y="${label.y}" tabindex="0" role="button" aria-label="查看${planet.name}位置">`);
    bits.push(`<line x1="${label.dotX}" y1="${label.dotY}" x2="${label.x}" y2="${label.y}" stroke="${color}" stroke-width=".8" opacity=".7"/>`);
    bits.push(`<circle cx="${label.dotX}" cy="${label.dotY}" r="2.5" fill="#070809" stroke="${color}" stroke-width="1.4"/>`);
    bits.push(`<circle cx="${label.x}" cy="${label.y}" r="36" fill="transparent"/>`);
    bits.push(`<text x="${label.x}" y="${label.y}" class="planet-label" fill="${color}" stroke="#070809" stroke-width="3" paint-order="stroke">${shortName}</text></g>`);
  });
  bits.push('<circle cx="240" cy="240" r="2.5" fill="#8a9094"/></svg>');
  return bits.join('');
}
