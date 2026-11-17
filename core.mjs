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

export function chartAngles(date, latitude, longitude) {
  const centuries = (date.getTime() / 86400000 + 2440587.5 - 2451545) / 36525;
  const obliquity = radians(23.439291 - 0.0130042 * centuries);
  const sidereal = radians(normalize(globalThis.Astronomy.SiderealTime(date) * 15 + longitude));
  const asc = ascendant(date, latitude, longitude);
  // 中天的赤经等于当地恒星时；它与整宫制第十宫宫头分别展示。
  const mc = normalize(degrees(Math.atan2(Math.sin(sidereal),Math.cos(sidereal)*Math.cos(obliquity))));
  return {asc,dsc:normalize(asc+180),mc,ic:normalize(mc+180)};
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
  const angles = input.unknownTime ? null : chartAngles(date, latitude, longitude);
  const rising = angles?.asc ?? null;
  const planets = planetDefinitions.map(([body, name, symbol]) => {
    const position = planetLongitude(body, date);
    return {body,name,symbol,longitude:position,sign:signIndex(position),house:rising === null ? null : (signIndex(position) - signIndex(rising) + 12) % 12 + 1};
  });
  return {input:{...input,latitude,longitude},date,rising,angles,planets,sun:planets[0],moon:planets[1],five:calculateFiveElements(input.date,time,input.unknownTime,date)};
}

const aspectRules = [
  {angle:0,name:'合相'},{angle:60,name:'六合'},{angle:90,name:'四分相'},
  {angle:120,name:'三分相'},{angle:180,name:'对分相'},
];

// 每个变体包含完整解读，避免爱情、事业遗漏更新；实际日期决定变体，滚动窗口不影响同一天的内容。
const dailyReadings = {
  0:[
    {title:'把注意力放回当下',summary:'能量聚焦在重要的主题，适合认真投入一件事。',love:'放下手机，给对方一段完整的倾听时间，说清楚此刻最在意的感受。',career:'选出一个关键任务，集中精力先完成可交付的部分。'},
    {title:'让重要的对话发生',summary:'内心反复出现的想法，值得被清楚地表达。',love:'找一个舒服的时机，谈谈对关系的期待，也问问对方的真实需要。',career:'主动对齐项目目标，把含糊的要求整理成具体清单。'},
    {title:'把专注沉淀为进展',summary:'给投入留下一个落点，让想法成为可见的成果。',love:'用一件实际的小事兑现关心，让承诺变成对方看得见的行动。',career:'回看手头工作的进度，提交一个阶段成果，再安排下一步。'},
  ],
  60:[
    {title:'给新的可能留一扇门',summary:'轻盈的小尝试，能给熟悉的生活带来新的入口。',love:'分享一个日常的小发现，或主动发出一次轻松的邀约。',career:'尝试一个新工具或工作方法，用小任务检验它是否合适。'},
    {title:'让交流带来新视角',summary:'想法在交换中变得丰富，留意别人带来的启发。',love:'一起聊聊最近感兴趣的事，给彼此提一个真诚而开放的问题。',career:'向有经验的同伴请教一个具体问题，记录可借鉴的方法。'},
    {title:'把小机会变成下一步',summary:'挑选一个值得继续的尝试，让机会慢慢生长。',love:'延续一次愉快的交流，为共同的兴趣安排一个小计划。',career:'从最近收集的建议中选出一项，确定负责人、时间和第一步。'},
  ],
  90:[
    {title:'慢一步，也能走得更稳',summary:'不同的需要可能同时出现，先分清优先级。',love:'情绪上来时先停一停，核对彼此的意思，再讨论具体问题。',career:'检查任务边界与剩余时间，暂缓承接超出精力的新事项。'},
    {title:'把复杂的事拆小一点',summary:'遇到卡住的地方，先找一个可以松动的小环节。',love:'把笼统的不满换成一个具体请求，让对方知道怎样回应你。',career:'把困难任务分成几个步骤，先解决最清楚、最容易验证的一步。'},
    {title:'为调整留一点空间',summary:'允许方法发生变化，适度调整有助于继续前进。',love:'给彼此一些独处与整理感受的时间，再约定重新沟通的时机。',career:'复盘造成返工的环节，修订安排，并为意外留出时间余量。'},
  ],
  120:[
    {title:'顺着你的节奏向前',summary:'发挥熟悉的优势，用有把握的小行动积累信心。',love:'安排一段舒适的共同时间，用自然的陪伴表达喜欢。',career:'先推进自己擅长的工作，完成一个清晰的小目标。'},
    {title:'让擅长的事开出花来',summary:'把经验拿出来交流，也看见身边人的长处。',love:'具体地说出一件你欣赏对方的事，让肯定落在真实细节上。',career:'向同伴分享一个有效的方法，尝试用协作放大已有优势。'},
    {title:'把顺手的方法留下来',summary:'整理最近顺利的进展，让好的节奏延续到日常。',love:'回想一次让彼此开心的相处，把它变成可以重复的小约定。',career:'将有效的步骤整理成笔记或模板，为下一次工作节省精力。'},
  ],
  180:[
    {title:'在不同声音间找到平衡',summary:'把自己的期待与外部的节奏一起看见，再选择方向。',love:'先听完对方的立场，再表达自己的需要，避免急于分出对错。',career:'与合作方核对目标和分工，找出双方优先级不同的地方。'},
    {title:'为彼此的期待留个位置',summary:'差异值得被讨论，也可以成为重新理解彼此的机会。',love:'商量一项双方都能接受的安排，为各自的空间保留余地。',career:'遇到意见分歧时列出共同目标，提出一个可验证的折中方案。'},
    {title:'把共识化为具体行动',summary:'让讨论落在明确的约定上，边界清晰才能从容协作。',love:'把已经说好的事情具体化，确认时间、方式与彼此的期待。',career:'记录讨论结论，明确责任、期限和交付标准，减少反复确认。'},
  ],
  quiet:[
    {title:'把日常过成喜欢的样子',summary:'当天没有紧密的主要相位，适合按自己的步调安排生活。',love:'主动问候，留出一段不被打断的交流时间。',career:'选定一件关键任务，合理分配精力与休息时间。'},
    {title:'为好奇心留一点空间',summary:'尝试一种新的表达或学习方式，把注意力放在可掌握的事情上。',love:'一起尝试一件轻松的小事，让相处多一点新鲜感。',career:'整理一个新想法，先验证最小的下一步。'},
    {title:'把积累化成小小进展',summary:'回看近期的感受，给有效的方法一次继续的机会。',love:'表达感谢，照顾好关系里那些平常的小细节。',career:'复盘一次进展，为接下来安排清晰的优先级。'},
  ],
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
    const dayNumber = Math.floor((date.getTime()+8*3600000)/86400000);
    const variant = dailyReadings[exact ? closest.angle : 'quiet'][dayNumber%3];
    const reading = exact ? {...closest,...variant} : variant;
    return {date,...reading,aspect:exact ? `${planetDefinitions.find(planet => planet[0] === closest.body)[1]}与本命太阳${closest.name} · 容许度 ${closest.orb.toFixed(1)}°` : '当天未检出 6° 内的主要相位 · 日常灵感',sign:signs[signIndex(sunLongitude)].name};
  });
}

export function degreeLabel(longitude) {
  const arcMinutes = Math.floor(normalize(longitude) % 30 * 60);
  return `${Math.floor(arcMinutes / 60)}°${String(arcMinutes % 60).padStart(2,'0')}′`;
}
