import { signs, houses, elements, cities } from './data.mjs';
import { calculateChart, signIndex, threeDayForecast, degreeLabel } from './core.mjs?v=2';
import { renderChartSvg } from './wheel.mjs?v=2';

const $ = id => document.getElementById(id);
const storageKey = 'astra-birth-v1';
let currentChart;
let selectedSign = 2;
const forecastState = {longitude:null,personal:true,day:0,dateKey:''};
let toastTimer;
const sampleInput = {date:'2000-06-15',time:'14:30',city:'0',latitude:31.2304,longitude:121.4737,timezone:'Asia/Shanghai',unknownTime:false,custom:false};
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const tagHtml = values => values.map(value => `<span class="tag">${escapeHtml(value)}</span>`).join('');

function notify(message) {
  $('app-status').textContent = message;
  $('app-status').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ $('app-status').hidden = true; },3500);
}

function setActiveTab(name, updateHash = true) {
  const aliases = {'birth-section':'natal',report:'natal',houses:'natal'};
  const tab = aliases[name] ?? name;
  const active = ['natal','forecast','elements','zodiac'].includes(tab) ? tab : 'natal';
  document.querySelectorAll('.main-tab').forEach(button=>{
    const selected = button.dataset.tab === active;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-selected',String(selected));
    button.tabIndex = selected ? 0 : -1;
    $(`panel-${button.dataset.tab}`).hidden = !selected;
  });
  if (updateHash) history.replaceState(null,'',`#${active}`);
  window.scrollTo({top:0,behavior:'instant'});
}

function syncCustomInputs() {
  for (const id of ['latitude','longitude','timezone']) $(id).disabled = !$('use-custom').checked;
}

function openEditor() {
  fillForm(currentChart.input);
  $('form-error').textContent = '';
  $('birth-dialog').showModal();
  document.body.classList.add('dialog-open');
  syncEditorViewport();
  $('close-editor').focus();
}

function closeEditor() { $('birth-dialog').close(); }

function syncEditorViewport() {
  if(!$('birth-dialog').open) return;
  const viewport=window.visualViewport;
  const height=viewport?.height??innerHeight;
  const bottom=Math.max(0,innerHeight-height-(viewport?.offsetTop??0));
  document.documentElement.style.setProperty('--editor-height',`${height}px`);
  document.documentElement.style.setProperty('--keyboard-offset',`${bottom}px`);
}

function selectForecastDay(index) {
  forecastState.day = index;
  document.querySelectorAll('.day-tab').forEach((button,position)=>{
    button.setAttribute('aria-selected',String(position===index));
    button.tabIndex = position===index ? 0 : -1;
    $(`day-panel-${position}`).hidden = position!==index;
  });
}

function bindTabKeyboard(container, selector, select) {
  container.addEventListener('keydown',event=>{
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const buttons = [...container.querySelectorAll(selector)];
    const index = buttons.indexOf(event.target);
    if (index<0) return;
    event.preventDefault();
    const next = event.key==='Home' ? 0 : event.key==='End' ? buttons.length-1 : (index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
    select(buttons[next]);
    buttons[next].focus();
  });
}

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
  syncCustomInputs();
  if (input.custom) document.querySelector('.custom-location').open = true;
}

function renderWheel(chart) {
  $('chart').innerHTML = renderChartSvg(chart);
  $('planet-selection').textContent = '点击星体简称，查看星座与落宫';
  const risingSign = chart.rising === null ? null : signs[signIndex(chart.rising)];
  $('big-three').innerHTML = [
    ['☉','太阳星座',signs[chart.sun.sign].name],['☾','月亮星座',signs[chart.moon.sign].name],['↗','上升星座',risingSign?.name ?? '时间待定'],
  ].map(([symbol,label,name])=>`<div class="big-three-item"><span class="planet-icon">${symbol}</span><small>${label}</small><strong>${name}</strong></div>`).join('');
  const place = chart.input.custom ? '自定义地点' : cities[Number(chart.input.city)][0];
  $('chart-caption').textContent = `${chart.input.date} · ${chart.input.unknownTime ? '时间不详' : chart.input.time} · ${place}`;
  $('chart-time-note').textContent = chart.input.unknownTime ? '正午参考：月亮等行星可能跨星座，上升、四轴、宫位与时柱待定。' : '';
  const axisRows = chart.angles ? [['升 ASC',chart.angles.asc],['降 DSC',chart.angles.dsc],['顶 MC',chart.angles.mc],['底 IC',chart.angles.ic]].map(([label,longitude])=>`<tr><td>${label}</td><td>${signs[signIndex(longitude)].name} ${degreeLabel(longitude)}</td><td>四轴</td></tr>`).join('') : '';
  $('planet-positions').innerHTML = `<table><caption class="sr-only">本命行星位置与四轴</caption><thead><tr><th>行星 / 轴点</th><th>星座 / 黄经</th><th>宫位</th></tr></thead><tbody>${chart.planets.map(planet=>`<tr><td>${planet.name}</td><td>${signs[planet.sign].name} ${degreeLabel(planet.longitude)}</td><td>${planet.house ? `第 ${planet.house} 宫` : '待定'}</td></tr>`).join('')}${axisRows}</tbody></table>`;
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
  const dateKey = forecast[0].date.toISOString();
  if (dateKey !== forecastState.dateKey) forecastState.day = 0;
  Object.assign(forecastState,{longitude,personal,dateKey});
  $('forecast-range').textContent = `${shortDate(forecast[0].date)} — ${shortDate(forecast[2].date)} · 北京时间`;
  $('forecast-subject').textContent = `${forecast[0].sign} · ${personal ? '当前星盘的太阳位置' : '星座通用参考'}`;
  $('forecast-reset').hidden = personal;
  $('forecast-tabs').innerHTML = forecast.map((day,index)=>`<button id="day-tab-${index}" class="day-tab" role="tab" type="button" data-day="${index}" aria-selected="${index===forecastState.day}" aria-controls="day-panel-${index}" tabindex="${index===forecastState.day ? 0 : -1}">${['今天','明天','后天'][index]}<small>${shortDate(day.date)}</small></button>`).join('');
  $('forecast-cards').innerHTML = forecast.map((day,index)=>`<article id="day-panel-${index}" class="forecast-card" role="tabpanel" aria-labelledby="day-tab-${index}" ${index===forecastState.day ? '' : 'hidden'}><div class="forecast-day"><strong>${['今天','明天','后天'][index]}${index===0 ? '<span class="today-label">TODAY</span>' : ''}</strong><span>${shortDate(day.date)} · ${day.sign}</span></div><h2>${day.title}</h2><p class="forecast-summary">${day.summary}</p><div class="forecast-topic"><span>爱情</span><span>${day.love}</span></div><div class="forecast-topic"><span>事业</span><span>${day.career}</span></div><p class="aspect-label">${personal ? day.aspect : day.aspect.replace('本命太阳','该星座中点')}<br>${personal ? '基于当前展示的本命太阳位置' : '按该星座黄经中点计算'}</p></article>`).join('');
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
    return `<tr><td>第 ${String(index+1).padStart(2,'0')} 宫<small>${theme}</small></td><td>${signs[index].name}</td><td>${sign ? sign.name : '时间待定'}</td></tr>`;
  }).join('');
}

function render(input, sample = false) {
  // 先完成计算再更新视图，输入有误时保留上一次有效结果。
  const chart = calculateChart(input);
  currentChart = chart;
  renderWheel(chart);
  renderPortrait(chart);
  forecastState.day = 0;
  renderForecast(chart.sun.longitude);
  renderElements(chart.five);
  renderSign(chart.sun.sign);
  renderHouses(chart);
  $('sample-label').textContent = sample ? '示例星盘' : '你的本命星盘';
  $('profile-title').textContent = sample ? '示例星盘' : '我的星盘';
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
  setActiveTab(location.hash.slice(1),false);
}

$('birth-form').addEventListener('submit',event=>{
  event.preventDefault();
  try {
    render(readForm());
    $('storage-status').textContent = '本次结果已生成；点击“记住资料”才会保存。';
    closeEditor();
    setActiveTab('natal');
    notify('星盘已更新，资料仅在浏览器内计算');
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
$('use-custom').addEventListener('change',syncCustomInputs);
$('profile-button').addEventListener('click',openEditor);
$('edit-button').addEventListener('click',openEditor);
$('close-editor').addEventListener('click',closeEditor);
$('birth-dialog').addEventListener('close',()=>{
  document.body.classList.remove('dialog-open');
  document.documentElement.style.removeProperty('--editor-height');
  document.documentElement.style.removeProperty('--keyboard-offset');
});
window.addEventListener('resize',syncEditorViewport);
window.visualViewport?.addEventListener('resize',syncEditorViewport);
window.visualViewport?.addEventListener('scroll',syncEditorViewport);
$('birth-dialog').addEventListener('click',event=>{
  if(event.target!==$('birth-dialog')) return;
  const bounds=$('birth-dialog').getBoundingClientRect();
  if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom) closeEditor();
});
document.querySelector('.app-nav').addEventListener('click',event=>{
  const button=event.target.closest('[data-tab]');
  if(button) setActiveTab(button.dataset.tab);
});
bindTabKeyboard(document.querySelector('.nav-inner'),'.main-tab',button=>setActiveTab(button.dataset.tab));
window.addEventListener('hashchange',()=>setActiveTab(location.hash.slice(1),false));
$('forecast-tabs').addEventListener('click',event=>{
  const button=event.target.closest('[data-day]');
  if(button) selectForecastDay(Number(button.dataset.day));
});
bindTabKeyboard($('forecast-tabs'),'.day-tab',button=>selectForecastDay(Number(button.dataset.day)));
$('forecast-reset').addEventListener('click',()=>{
  forecastState.day=0;
  renderForecast(currentChart.sun.longitude,true);
});
$('reading-button').addEventListener('click',()=>scrollToSection($('report')));
$('parameters-button').addEventListener('click',()=>{
  $('planet-details').open=true;
  scrollToSection($('planet-details'));
});
$('chart-help').addEventListener('click',()=>{
  $('methods').open=true;
  scrollToSection($('methods'));
});
function scrollToSection(section) {
  section.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
}
function showPlanet(event) {
  let target=event.target.closest('[data-planet]');
  if(!target) return;
  if(event.type==='click'){
    // 扩大手机触摸区域后，拥挤处按距离最近的标签判定，避免后绘制的透明区域抢占点击。
    const svg=$('chart').querySelector('svg');
    const pointer=svg.createSVGPoint();
    pointer.x=event.clientX;
    pointer.y=event.clientY;
    const local=pointer.matrixTransform(svg.getScreenCTM().inverse());
    target=[...svg.querySelectorAll('[data-planet]')].sort((first,second)=>
      Math.hypot(local.x-Number(first.dataset.labelX),local.y-Number(first.dataset.labelY))-
      Math.hypot(local.x-Number(second.dataset.labelX),local.y-Number(second.dataset.labelY))
    )[0];
  }
  const planet=currentChart.planets[Number(target.dataset.planet)];
  $('planet-selection').textContent=`${planet.name} · ${signs[planet.sign].name} ${degreeLabel(planet.longitude)} · ${planet.house?`第 ${planet.house} 宫`:'宫位待定'}`;
}
$('chart').addEventListener('click',showPlanet);
$('chart').addEventListener('keydown',event=>{
  if(['Enter',' '].includes(event.key)&&event.target.closest('[data-planet]')){
    event.preventDefault();
    showPlanet(event);
  }
});
$('zodiac-grid').addEventListener('click',event=>{
  const button = event.target.closest('[data-sign]');
  if (!button) return;
  renderSign(Number(button.dataset.sign));
});
$('zodiac-forecast').addEventListener('click',()=>{
  forecastState.day=0;
  renderForecast(selectedSign*30+15,false);
  setActiveTab('forecast');
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
    closeEditor();
    setActiveTab('natal');
    notify('本地资料已清除，已恢复示例');
  } catch { $('storage-status').textContent = '请在浏览器设置中清除此站点的本地存储。'; }
});
// 页面跨过北京时间零点或从后台返回时，更新三天日期和相位。
function refreshForecast() {
  if (!currentChart) return;
  const dateText = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(new Date(`${dateText}T12:00:00+08:00`).toISOString()===forecastState.dateKey) return;
  renderForecast(forecastState.longitude,forecastState.personal);
}
document.addEventListener('visibilitychange',()=>{ if (!document.hidden) refreshForecast(); });
setInterval(refreshForecast,60000);

try { initialize(); } catch (error) {
  $('form-error').textContent = `页面初始化遇到问题：${error.message}`;
  notify(`页面加载异常：${error.message}`);
}
