import { signs, houses, elements, cities } from './data.mjs';
import { calculateChart, signIndex, normalize, angularDistance, threeDayForecast, degreeLabel } from './core.mjs';

const $ = id => document.getElementById(id);
const storageKey = 'astra-birth-v1';
let currentChart;
let selectedSign = 2;
const sampleInput = {date:'2000-06-15',time:'14:30',city:'0',latitude:31.2304,longitude:121.4737,timezone:'Asia/Shanghai',unknownTime:false,custom:false};
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const tagHtml = values => values.map(value => `<span class="tag">${escapeHtml(value)}</span>`).join('');

function readForm() {
  const city = cities[Number($('birth-city').value)];
  const custom = $('use-custom').checked;
  if (custom && (!$('latitude').value.trim() || !$('longitude').value.trim() || !$('timezone').value.trim())) throw new Error('请填写自定义地点的经纬度与时区。');
  return {
    date:$('birth-date').value,time:$('birth-time').value,city:$('birth-city').value,
    latitude:custom ? Number($('latitude').value) : city[2],
    longitude:custom ? Number($('longitude').value) : city[3],
    timezone:custom ? $('timezone').value.trim() : city[1],
    unknownTime:$('unknown-time').checked,custom,
  };
}

function fillForm(input) {
  $('birth-date').value = input.date;
  $('birth-time').value = input.time;
  $('birth-city').value = cities[Number(input.city)] ? input.city : '0';
  $('unknown-time').checked = Boolean(input.unknownTime);
  $('use-custom').checked = Boolean(input.custom);
  $('latitude').value = input.latitude;
  $('longitude').value = input.longitude;
  $('timezone').value = input.timezone;
  $('birth-time').disabled = Boolean(input.unknownTime);
  $('birth-time').required = !input.unknownTime;
  if (input.custom) document.querySelector('.custom-location').open = true;
}

function renderWheel(chart) {
  const rotation = chart.rising ?? 0;
  const point = (longitude, radius) => {
    const angle = (180 - (longitude - rotation)) * Math.PI / 180;
    return [220 + Math.cos(angle) * radius,220 + Math.sin(angle) * radius];
  };
  const line = (longitude, inner, outer, color, width = .7) => {
    const [x1,y1] = point(longitude,inner);
    const [x2,y2] = point(longitude,outer);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"/>`;
  };
  const palette = {火:'#c69da8',土:'#bcad85',风:'#9aabbd',水:'#a49ac5'};
  const bits = ['<svg viewBox="0 0 440 440" role="img" aria-labelledby="wheel-title wheel-description"><title id="wheel-title">个人星盘</title><desc id="wheel-description">外圈为十二星座，内圈为行星位置。详细黄经和宫位可在下方展开查看。</desc>'];
  // 全部位置由黄经绘制；装饰星点为固定布局，与计算结果无关。
  for (const [x,y,size] of [[29,58,2],[387,68,1.5],[409,290,2],[36,329,1.4],[81,27,1],[371,384,1.3],[191,12,1]]) bits.push(`<path d="M${x-size*2} ${y}h${size*4}m-${size*2} -${size*2}v${size*4}" stroke="#d6c7e6" stroke-width="1"/>`);
  bits.push('<circle cx="220" cy="220" r="195" fill="#f9f6fd" stroke="#c7b6da" stroke-width=".8"/><circle cx="220" cy="220" r="186" fill="none" stroke="#ded2eb" stroke-width=".6"/><circle cx="220" cy="220" r="146" fill="#fdfbff" stroke="#c9b8dc" stroke-width=".8"/><circle cx="220" cy="220" r="128" fill="none" stroke="#e3d9ee" stroke-width=".7"/><circle cx="220" cy="220" r="91" fill="none" stroke="#ece4f3" stroke-width=".6"/>');
  for (let index = 0; index < 360; index += 2) bits.push(line(index,index % 10 === 0 ? 180 : 183,186,'#d3c4e2',index % 10 === 0 ? .8 : .45));
  signs.forEach((sign,index) => {
    bits.push(line(index*30,146,195,'#d4c5e3'));
    const [x,y] = point(index*30+15,164);
    bits.push(`<text x="${x}" y="${y}" dominant-baseline="central" text-anchor="middle" fill="${palette[sign.element]}" font-family="Arial,sans-serif" font-size="24">${sign.symbol}<title>${sign.name} · ${sign.element}象</title></text>`);
    if (chart.rising !== null) {
      const [hx,hy] = point(index*30+15,137);
      const house = (index-signIndex(chart.rising)+12)%12+1;
      bits.push(`<text x="${hx}" y="${hy}" dominant-baseline="central" text-anchor="middle" fill="#bba6ca" font-family="Georgia,serif" font-size="9">${house}</text>`);
      bits.push(line(index*30,91,146,'#e3d8ed',.5));
    }
  });
  for (let first = 0; first < chart.planets.length; first++) for (let second = first+1; second < chart.planets.length; second++) {
    const a = chart.planets[first];
    const b = chart.planets[second];
    const distance = angularDistance(a.longitude,b.longitude);
    const harmonious = Math.abs(distance-120)<4 || Math.abs(distance-60)<4;
    const tense = Math.abs(distance-90)<4 || Math.abs(distance-180)<4;
    if (harmonious || tense) {
      const [x1,y1] = point(a.longitude,91);
      const [x2,y2] = point(b.longitude,91);
      bits.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${harmonious ? '#afa5ca' : '#cfacb8'}" stroke-width=".65" opacity=".65"/>`);
    }
  }
  const placed = [...chart.planets].sort((first,second)=>first.longitude-second.longitude);
  placed.forEach((planet,index) => {
    const near = placed.some(other => other !== planet && angularDistance(other.longitude,planet.longitude)<13);
    const radius = near ? [102,116,125][index%3] : 110;
    const [x,y] = point(planet.longitude,radius);
    const [dx,dy] = point(planet.longitude,91);
    const color = planet.body === 'Sun' ? '#c3a170' : planet.body === 'Moon' ? '#9e92b8' : '#a285b8';
    bits.push(`<circle cx="${dx}" cy="${dy}" r="1.6" fill="${color}"/><text x="${x}" y="${y}" dominant-baseline="central" text-anchor="middle" font-family="Arial,sans-serif" fill="${color}" font-size="18">${planet.symbol}<title>${planet.name} · ${signs[planet.sign].name} ${degreeLabel(planet.longitude)}${planet.house ? ` · 第${planet.house}宫` : ''}</title></text>`);
  });
  if (chart.rising !== null) {
    bits.push(line(chart.rising,127,205,'#a38abb',1));
    bits.push('<text x="8" y="224" fill="#9f84b8" font-family="DM Sans,sans-serif" font-size="9">ASC</text>');
  }
  bits.push('<circle cx="220" cy="220" r="39" fill="#fdfbff" opacity=".95"/><path d="M220 192v10m-5-5h10" stroke="#b8a3ca" stroke-width="1"/><text x="220" y="221" text-anchor="middle" font-family="Georgia,serif" fill="#b1a0bf" font-size="10" letter-spacing="2">YOUR</text><text x="220" y="238" text-anchor="middle" font-family="Georgia,serif" fill="#a48aBA" font-size="11" letter-spacing="2">UNIVERSE</text></svg>');
  $('chart').innerHTML = bits.join('');
  const risingSign = chart.rising === null ? null : signs[signIndex(chart.rising)];
  $('big-three').innerHTML = [
    ['☉','太阳星座',signs[chart.sun.sign].name],['☾','月亮星座',signs[chart.moon.sign].name],['↗','上升星座',risingSign?.name ?? '时间待定'],
  ].map(([symbol,label,name])=>`<div class="big-three-item"><span class="planet-icon">${symbol}</span><small>${label}</small><strong>${name}</strong></div>`).join('');
  const place = chart.input.custom ? '自定义地点' : cities[Number(chart.input.city)][0];
  $('chart-caption').textContent = `${chart.input.date} · ${chart.input.unknownTime ? '正午参考，月亮可能跨星座' : chart.input.time} · ${place} · ${chart.input.unknownTime ? '宫位待定' : '热带黄道 / 整宫制'}`;
  let details = $('planet-details');
  if (!details) {
    details = document.createElement('details');
    details.id = 'planet-details';
    details.className = 'planet-details';
    $('chart-card').append(details);
  }
  details.innerHTML = `<summary>查看行星位置与落宫 <span>+</span></summary><div class="planet-table-scroll"><table><caption class="sr-only">本命行星位置</caption><thead><tr><th>行星</th><th>星座 / 黄经</th><th>宫位</th></tr></thead><tbody>${chart.planets.map(planet=>`<tr><td>${planet.symbol} ${planet.name}</td><td>${signs[planet.sign].name} ${degreeLabel(planet.longitude)}</td><td>${planet.house ? `第 ${planet.house} 宫` : '待定'}</td></tr>`).join('')}${chart.rising === null ? '' : `<tr><td>ASC 上升点</td><td>${risingSign.name} ${degreeLabel(chart.rising)}</td><td>第 1 宫</td></tr>`}</tbody></table></div>`;
}

function renderPortrait(chart) {
  const sun = signs[chart.sun.sign];
  const moon = signs[chart.moon.sign];
  const venus = signs[chart.planets.find(planet=>planet.body==='Venus').sign];
  const rising = chart.rising === null ? null : signs[signIndex(chart.rising)];
  const items = [
    ['✧','性格 · 你的内在光芒',`${sun.personality} 月亮${moon.name}为你的情绪需求加入${moon.traits[0]}的色彩${chart.input.unknownTime ? '，时间不详时此项仅供正午参考' : ''}。${rising ? `上升${rising.name}则让你更容易以${rising.traits[0]}、${rising.traits[1]}的方式面对外界。` : ''}`,[`${sun.element}象太阳`,...sun.traits]],
    ['♡','爱情 · 你的心动方式',`${sun.love} 金星落在${venus.name}，可从“${venus.traits[0]}”与“${venus.traits[1]}”的主题，观察自己表达喜欢的方式。`,['真诚沟通','相互理解',`金星${venus.name}`]],
    ['⌁','事业 · 你的可能方向',`${sun.career}${rising ? `你的第十宫落在${signs[(signIndex(chart.rising)+9)%12].name}，可把“${signs[(signIndex(chart.rising)+9)%12].traits[0]}”作为进一步探索的线索。` : '结合自己的能力、兴趣和实际经验，逐步尝试适合的工作。'}`,sun.jobs],
  ];
  $('portrait').innerHTML = items.map(([icon,title,text,tags])=>`<article class="card portrait-card"><div class="icon-tile">${icon}</div><h3>${title}</h3><p>${text}</p><div class="tag-row">${tagHtml(tags)}</div></article>`).join('');
}

function renderForecast(longitude, personal = true) {
  const forecast = threeDayForecast(longitude);
  const shortDate = date => new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit'}).format(date);
  $('forecast-range').textContent = `${shortDate(forecast[0].date)} — ${shortDate(forecast[2].date)} · 北京时间`;
  $('forecast-cards').innerHTML = forecast.map((day,index)=>`<article class="card forecast-card"><div class="forecast-day"><strong>${['今天','明天','后天'][index]}${index===0 ? '<span class="today-label">TODAY</span>' : ''}</strong><span>${shortDate(day.date)} · ${day.sign}</span></div><h3>${day.title}</h3><p class="forecast-summary">${day.summary}</p><div class="forecast-topic"><span>爱情</span><span>${day.love}</span></div><div class="forecast-topic"><span>事业</span><span>${day.career}</span></div><p class="aspect-label">${personal ? day.aspect : day.aspect.replace('本命太阳','该星座中点')}<br>${personal ? '基于当前展示的本命太阳位置' : '星座通用参考，按太阳黄经中点计算'}</p></article>`).join('');
}

function renderElements(five) {
  $('day-master').textContent = `日主 ${five.dayStem}${five.dayElement}`;
  const max = Math.max(...Object.values(five.counts),1);
  $('elements-chart').innerHTML = Object.entries(five.counts).map(([element,count])=>`<div class="element-column"><div class="element-track" role="img" aria-label="${element} ${count} 个，占 ${Math.round(count/five.total*1000)/10}%"><div class="element-fill" style="--element-color:${elements[element].color};height:${Math.max(3,count/max*105)}px"><span class="element-count">${count}</span></div></div><strong>${element}</strong><small>${Math.round(count/five.total*1000)/10}%</small></div>`).join('');
  $('pillars').innerHTML = five.columns.map(column=>`<div class="pillar"><small>${column.label}</small><strong>${column.value}</strong><span>${column.element || '出生时间待定'}</span></div>`).join('');
  $('element-method').textContent = `${five.unknownTime ? '出生时间不详：按正午参考年、月、日六字，临近节气时年、月柱也可能变化；时柱待定。' : '以四柱八字的天干与地支本气计数，共 8 字。'} 未计藏干、季节旺衰，计数不等于喜用神。`;
  const dominant = Object.keys(five.counts).filter(element=>five.counts[element]===max);
  const absent = Object.keys(five.counts).filter(element=>five.counts[element]===0);
  const data = elements[five.dayElement];
  $('element-reading').innerHTML = `<div class="section-kicker">YOUR FIVE-ELEMENT PORTRAIT</div><div class="element-hero-symbol">${five.dayElement}</div><h3>${five.dayStem}${five.dayElement}日主 · ${data.keyword.split(' · ')[0]}的力量</h3><p>${data.text}</p><div class="tag-row">${tagHtml(data.keyword.split(' · '))}</div><p class="small-reading">${dominant.join('、')}在本气计数中较多。${absent.length ? `${absent.join('、')}的本气计数为 0；这不代表命局完全缺少该元素，也不直接指向补充建议。` : '五种元素在本气计数中均有出现。'}<br>${data.balance}</p>`;
}

function renderSign(index) {
  selectedSign = index;
  document.querySelectorAll('.zodiac-button').forEach((button,position)=>{
    button.classList.toggle('selected',position===index);
    button.setAttribute('aria-pressed',String(position===index));
  });
  const sign = signs[index];
  $('zodiac-detail').innerHTML = `<div><div class="section-kicker">${sign.element} ELEMENT · ${sign.mode}星座</div><h3>${sign.symbol} ${sign.name}</h3><div class="detail-subtitle">守护星 ${sign.ruler} · 自然第 ${index+1} 宫</div><p>${sign.theme}</p><div class="tag-row">${tagHtml(sign.traits)}</div></div><div class="detail-grid"><div><h4>性格特点</h4><p>${sign.personality}</p></div><div><h4>爱情与关系</h4><p>${sign.love}</p></div><div><h4>事业探索</h4><p>${sign.career}</p></div><div><h4>宫位与天干</h4><p>自然第 ${index+1} 宫：${houses[index]}。实际落宫由上升星座决定；天干请查看个人出生四柱，两者分别计算。</p></div></div>`;
}

function renderHouses(chart) {
  const risingIndex = chart.rising === null ? null : signIndex(chart.rising);
  $('house-table').innerHTML = houses.map((theme,index)=>{
    const sign = risingIndex === null ? null : signs[(risingIndex+index)%12];
    return `<tr><td>第 ${String(index+1).padStart(2,'0')} 宫</td><td>${theme}</td><td><span class="house-sign">${signs[index].symbol}</span>${signs[index].name}</td><td>${sign ? `<span class="house-sign">${sign.symbol}</span>${sign.name}` : '出生时间待定'}</td></tr>`;
  }).join('');
}

function render(input, sample = false) {
  // 先完成计算再更新视图，输入有误时保留上一次有效结果。
  const chart = calculateChart(input);
  currentChart = chart;
  renderWheel(chart);
  renderPortrait(chart);
  renderForecast(chart.sun.longitude);
  renderElements(chart.five);
  renderSign(chart.sun.sign);
  renderHouses(chart);
  $('sample-label').textContent = sample ? '示例星盘' : '你的本命星盘';
  $('report-label').textContent = sample ? '先看看一份示例解读' : `${signs[chart.sun.sign].name} · ${chart.input.unknownTime ? '出生时间待定' : `上升${signs[signIndex(chart.rising)].name}`}`;
  $('form-error').textContent = '';
}

function initialize() {
  $('birth-city').innerHTML = cities.map(([name],index)=>`<option value="${index}">${name}</option>`).join('');
  $('zodiac-grid').innerHTML = signs.map((sign,index)=>`<button class="zodiac-button" type="button" data-sign="${index}" aria-pressed="false"><span class="zodiac-symbol">${sign.symbol}</span><strong>${sign.name}</strong><small>${sign.dates}</small></button>`).join('');
  $('element-overview-content').innerHTML = Object.entries(elements).map(([element,data])=>`<article><h3 style="color:${data.color}">${element}<span>${data.keyword}</span></h3><p>${data.text}</p><p>${data.balance}</p></article>`).join('');
  $('year').textContent = new Date().getFullYear();
  $('birth-date').max = new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  fillForm(sampleInput);
  render(sampleInput,true);
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const input = JSON.parse(saved);
      calculateChart(input);
      fillForm(input);
      render(input);
      $('storage-status').textContent = '已读取此设备保存的资料';
    }
  } catch { $('storage-status').textContent = '本地资料未读取，当前展示示例。'; }
}

$('birth-form').addEventListener('submit',event=>{
  event.preventDefault();
  try {
    render(readForm());
    $('storage-status').textContent = '本次结果已生成；点击“记住资料”才会保存。';
    $('report').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',block:'start'});
  } catch (error) { $('form-error').textContent = error.message; }
});
$('unknown-time').addEventListener('change',()=>{
  $('birth-time').disabled = $('unknown-time').checked;
  $('birth-time').required = !$('unknown-time').checked;
});
$('birth-city').addEventListener('change',()=>{
  const [,timezone,latitude,longitude] = cities[Number($('birth-city').value)];
  $('latitude').value = latitude;
  $('longitude').value = longitude;
  $('timezone').value = timezone;
});
$('zodiac-grid').addEventListener('click',event=>{
  const button = event.target.closest('[data-sign]');
  if (!button) return;
  renderSign(Number(button.dataset.sign));
  const personal = selectedSign === currentChart.sun.sign;
  renderForecast(personal ? currentChart.sun.longitude : selectedSign*30+15,personal);
});
$('remember-button').addEventListener('click',()=>{
  try {
    const input = readForm();
    render(input);
    localStorage.setItem(storageKey,JSON.stringify(input));
    $('storage-status').textContent = '资料已保存在此设备';
  } catch (error) { $('storage-status').textContent = `保存未完成：${error.message}`; }
});
$('clear-button').addEventListener('click',()=>{
  try {
    localStorage.removeItem(storageKey);
    fillForm(sampleInput);
    render(sampleInput,true);
    $('storage-status').textContent = '本地资料已清除，已恢复示例';
  } catch { $('storage-status').textContent = '请在浏览器设置中清除此站点的本地存储。'; }
});
// 页面跨过北京时间零点或从后台返回时，更新三天日期和相位。
function refreshForecast() {
  if (!currentChart) return;
  const personal = selectedSign === currentChart.sun.sign;
  renderForecast(personal ? currentChart.sun.longitude : selectedSign*30+15,personal);
}
document.addEventListener('visibilitychange',()=>{ if (!document.hidden) refreshForecast(); });
setInterval(refreshForecast,60000);

try { initialize(); } catch (error) { $('form-error').textContent = `页面初始化遇到问题：${error.message}`; }
