import { signs } from './data.mjs';

export const normalize = value => ((value % 360) + 360) % 360;
export const signIndex = longitude => Math.floor(normalize(longitude) / 30);
export const angularDistance = (first, second) => Math.abs(((first - second + 540) % 360) - 180);
const radians = degrees => degrees * Math.PI / 180;
const degrees = value => value * 180 / Math.PI;
export const planetDefinitions = [
  ['Sun','太阳','☉'],['Moon','月亮','☽'],['Mercury','水星','☿'],['Venus','金星','♀'],['Mars','火星','♂'],['Jupiter','木星','♃'],['Saturn','土星','♄'],['Uranus','天王星','♅'],['Neptune','海王星','♆'],['Pluto','冥王星','♇'],
];

function localParts(date, timezone) {
  const values = new Intl.DateTimeFormat('en-CA', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  return Object.fromEntries(values.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}

export function localToUtc(dateText, timeText, timezone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || !/^\d{2}:\d{2}$/.test(timeText)) throw new Error('请填写完整的出生日期与时间。');
  const [year, month, day] = dateText.split('-').map(Number);
  const [hour, minute] = timeText.split(':').map(Number);
  const nominal = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(nominal);
  if (year < 1900 || year > 2100 || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) throw new Error('请输入 1900—2100 年间有效的出生日期与时间。');
  try { localParts(check, timezone); } catch { throw new Error('请使用有效的 IANA 时区，例如 Asia/Shanghai。'); }
  // 分别探测前后两天的时区偏移，识别夏令时跳时与重复时刻。
  const offsets = new Set([-36, 0, 36].map(hours => {
    const probe = new Date(nominal + hours * 3600000);
    const parts = localParts(probe, timezone);
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - probe.getTime();
  }));
  const matches = [...offsets].map(offset => new Date(nominal - offset)).filter(date => {
    const parts = localParts(date, timezone);
    return parts.year === year && parts.month === month && parts.day === day && parts.hour === hour && parts.minute === minute;
  });
  if (!matches.length) throw new Error('这个当地时刻处于夏令时跳时区间，请核对出生记录。');
  if (matches.length > 1) throw new Error('这个时刻因夏令时结束重复出现。请将时区改为出生记录的固定偏移，例如 Etc/GMT+5（UTC−5）。');
  return matches[0];
}

export function planetLongitude(body, date) {
  const astronomy = globalThis.Astronomy;
  if (!astronomy) throw new Error('星历文件尚未加载，请刷新页面重试。');
  if (body === 'Sun') return normalize(astronomy.SunPosition(date).elon);
  if (body === 'Moon') return normalize(astronomy.EclipticGeoMoon(date).lon);
  return normalize(astronomy.Ecliptic(astronomy.GeoVector(body, date, true)).elon);
}

export function ascendant(date, latitude, longitude) {
  const centuries = (date.getTime() / 86400000 + 2440587.5 - 2451545) / 36525;
  const obliquity = radians(23.439291 - 0.0130042 * centuries);
  const sidereal = radians(normalize(globalThis.Astronomy.SiderealTime(date) * 15 + longitude));
  // 黄道与地平线有两个交点；加 180° 选取东方升起的交点。
  return normalize(degrees(Math.atan2(-Math.cos(sidereal), Math.sin(sidereal) * Math.cos(obliquity) + Math.tan(radians(latitude)) * Math.sin(obliquity))) + 180);
}

export function calculateFiveElements(dateText, timeText, unknownTime, instant = null) {
  if (!globalThis.Solar) throw new Error('历法文件尚未加载，请刷新页面重试。');
  const [year, month, day] = dateText.split('-').map(Number);
  const [hour, minute] = timeText.split(':').map(Number);
  const eight = globalThis.Solar.fromYmdHms(year, month, day, hour, minute, 0).getLunar().getEightChar();
  eight.setSect(2); // 子正换日：23:00—23:59 的日柱仍属于当天。
  // 节气是全球同一瞬间；历法库的节气时刻采用北京时间。年/月柱先转换时区，日/时柱仍按出生地民用时间。
  const beijing = instant ? localParts(instant,'Asia/Shanghai') : null;
  const seasonal = beijing ? globalThis.Solar.fromYmdHms(beijing.year,beijing.month,beijing.day,beijing.hour,beijing.minute,beijing.second).getLunar().getEightChar() : eight;
  const columns = [
    {label:'年柱',value:seasonal.getYear(),element:seasonal.getYearWuXing()},
    {label:'月柱',value:seasonal.getMonth(),element:seasonal.getMonthWuXing()},
    {label:'日柱',value:eight.getDay(),element:eight.getDayWuXing()},
    {label:'时柱',value:unknownTime ? '待定' : eight.getTime(),element:unknownTime ? '' : eight.getTimeWuXing()},
  ];
  const counts = {木:0,火:0,土:0,金:0,水:0};
  for (const column of columns) for (const element of column.element) counts[element]++;
  const dayStem = eight.getDayGan();
  const stemElements = {甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水'};
  return {columns, counts, total:unknownTime ? 6 : 8, dayStem, dayElement:stemElements[dayStem], unknownTime};
}

export function calculateChart(input) {
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 66 || Math.abs(longitude) > 180) throw new Error('请填写南北纬 66° 以内、东西经 180° 以内的有效坐标。');
  const time = input.unknownTime ? '12:00' : input.time;
  const date = localToUtc(input.date, time, input.timezone);
  if (date.getTime() > Date.now()) throw new Error('出生时间晚于现在，请核对日期。');
  const rising = input.unknownTime ? null : ascendant(date, latitude, longitude);
  const planets = planetDefinitions.map(([body, name, symbol]) => {
    const position = planetLongitude(body, date);
    return {body,name,symbol,longitude:position,sign:signIndex(position),house:rising === null ? null : (signIndex(position) - signIndex(rising) + 12) % 12 + 1};
  });
  return {input:{...input,latitude,longitude},date,rising,planets,sun:planets[0],moon:planets[1],five:calculateFiveElements(input.date,time,input.unknownTime,date)};
}

const aspectRules = [
  {angle:0,name:'合相',title:'把注意力放回当下',summary:'能量聚焦在熟悉的主题。选一件真正重要的事，投入一点完整的时间。',love:'把在意说得具体，一段认真倾听的对话能拉近彼此。',career:'集中完成一个关键任务，为想法留下可见的进展。'},
  {angle:60,name:'六合',title:'给新的可能留一扇门',summary:'适合用轻盈的尝试打破惯性。一次主动的交流，或许会带来新的视角。',love:'分享一个日常的小发现，让交流自然发生。',career:'适合学习、交流或向同伴请教，把新方法用于一件小事。'},
  {angle:90,name:'四分相',title:'慢一步，也能走得更稳',summary:'不同的需求可能同时出现。先分清优先级，给调整留出一点余地。',love:'先核对彼此的理解，暂缓在情绪上升时作结论。',career:'检查任务边界与时间安排，分步推进会更轻松。'},
  {angle:120,name:'三分相',title:'顺着你的节奏向前',summary:'适合发挥熟悉的优势。让有把握的小行动，为你积累一些信心。',love:'用自然的陪伴表达喜欢，给关系一点舒适的共同时间。',career:'整理已有的积累，把擅长的事推进到下一步。'},
  {angle:180,name:'对分相',title:'在不同声音间找到平衡',summary:'自己的期待与外部节奏值得一起看见。听完另一种观点，再选择方向。',love:'为彼此的需要各留一个位置，用协商代替猜测。',career:'适合对齐合作预期，把责任、期限和交付说清楚。'},
];

const dailyVariations = {
  0:[['把注意力放回当下','让重要的对话发生','把专注沉淀为进展'],['选一件重要的事，给它一段完整的时间。','把近期反复想到的事情说出来，听听另一个视角。','回顾这几天的投入，让收获落在一个具体的行动上。']],
  60:[['给新的可能留一扇门','让交流带来新视角','把小机会变成下一步'],['用一次轻盈的尝试打破惯性，留意身边的小机会。','和信任的人交换想法，给好奇心一点回应。','挑选一个值得继续的尝试，让机会慢慢生长。']],
  90:[['慢一步，也能走得更稳','把复杂的事拆小一点','为调整留一点空间'],['不同的需求同时出现时，先分清优先级。','遇到卡住的事情，先核对信息，再拆成小步骤。','适合复盘任务边界，保留有效的方法，调整其余部分。']],
  120:[['顺着你的节奏向前','让擅长的事开出花来','把顺手的方法留下来'],['发挥熟悉的优势，用一个有把握的小行动积累信心。','把精力交给擅长的事，也分享一点你的经验。','整理最近顺利的进展，让好的节奏延续到日常。']],
  180:[['在不同声音间找到平衡','为彼此的期待留个位置','把共识化为具体行动'],['把自己的期待与外部的节奏一起看见，再选择方向。','听完另一种观点，重新对齐关系与合作中的需要。','把讨论里的共识写清楚，让分工与边界更明朗。']],
};

export function threeDayForecast(sunLongitude, now = new Date()) {
  const dateText = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const base = new Date(`${dateText}T12:00:00+08:00`);
  return [0,1,2].map(index => {
    const date = new Date(base.getTime() + index * 86400000);
    const candidates = ['Moon','Venus','Mars','Jupiter','Saturn'].flatMap(body => {
      const distance = angularDistance(planetLongitude(body,date), sunLongitude);
      return aspectRules.map(rule => ({...rule,body,orb:Math.abs(distance - rule.angle)}));
    }).sort((first, second) => first.orb - second.orb);
    const closest = candidates[0];
    const exact = closest.orb <= 6;
    const fallback = {
      title:['把今天过成喜欢的样子','为好奇心留一点空间','把积累化成小小进展'][index],
      summary:['没有紧密的主要相位时，不妨按自己的步调安排一天。让日常的小选择带来安定。','尝试一种新的表达或学习方式，把注意力放在可掌握的事情上。','回看这几天的感受，给有效的方法一次继续的机会。'][index],
      love:['主动问候，留出一段不被打断的交流时间。','一起尝试一件轻松的小事，让相处多一点新鲜感。','表达感谢，照顾好关系里那些平常的小细节。'][index],
      career:['选定一件关键任务，合理分配精力。','整理一个新想法，先验证最小的下一步。','复盘一次进展，为接下来安排清晰的优先级。'][index],
    };
    const reading = exact ? {...closest,title:dailyVariations[closest.angle][0][index],summary:dailyVariations[closest.angle][1][index]} : fallback;
    return {date,...reading,aspect:exact ? `${planetDefinitions.find(planet => planet[0] === closest.body)[1]}与本命太阳${closest.name} · 容许度 ${closest.orb.toFixed(1)}°` : '当天未检出 6° 内的主要相位 · 日常灵感',sign:signs[signIndex(sunLongitude)].name};
  });
}

export function degreeLabel(longitude) {
  const arcMinutes = Math.floor(normalize(longitude) % 30 * 60);
  return `${Math.floor(arcMinutes / 60)}°${String(arcMinutes % 60).padStart(2,'0')}′`;
}
