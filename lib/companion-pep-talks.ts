import type { Locale } from "@/lib/locale";

const PEP_EN = [
  "Small steps today add up to the work you will be proud of tomorrow.",
  "You do not need to finish everything — just make the next right move.",
  "Clarity comes from motion: ship a draft, then improve it.",
  "Protect your focus; depth beats constant context switching.",
  "Ask one good question — it often unlocks the whole room.",
  "Your calm is a feature when timelines get noisy.",
  "Good partnerships are built in the boring follow-through.",
  "Celebrate progress that nobody else saw — you earned it.",
  "When in doubt, document the decision and move on.",
  "One clear sentence in writing saves ten meetings.",
  "Rest is part of performance, not the opposite of it.",
  "You belong in the room. Speak once with intent.",
  "Done is a gift to your future self.",
  "Tight feedback loops beat perfect plans.",
  "Trust the process, but verify the risky bits.",
  "Kindness and rigor can share the same desk.",
  "If it feels heavy, break it into a two-minute start.",
  "Your standards lift the whole team.",
  "Curiosity is courage with a notebook.",
  "Ship value, then polish — order matters.",
  "You are allowed to change your mind when the facts change.",
  "Silence is not agreement — invite the dissenting view.",
  "Excellence is a habit of finishing the last 10%.",
  "Momentum is built from consecutive honest days.",
  "Keep the main thing the main thing.",
  "A short stand-up saves a long rescue.",
  "Your attention is the scarcest currency — spend it wisely.",
  "Write the risk down; it shrinks on paper.",
  "End the day with one clean handoff — future you will smile.",
  "Progress prefers showing up on schedule over waiting for perfect conditions.",
] as const;

const PEP_ZH = [
  "今天的一小步，会堆成明天你引以为傲的成果。",
  "不必一次做完，先做下一个正确的动作。",
  "动起来才有清晰度：先出一版，再迭代。",
  "保护专注力，深度胜过不停切换。",
  "一个好问题，常常能打开整间会议室。",
  "时间紧时，你的冷静就是团队资产。",
  "好合作，藏在日复一日的跟进里。",
  "别人没看见的进展，也值得为自己鼓掌。",
  "犹豫时，把决定写下来，然后前进。",
  "写清楚一句话，能省下十场会。",
  "休息是表现的一部分，不是对立面。",
  "你在场里。有意图地说一次就好。",
  "做完，是给未来自己的礼物。",
  "快反馈胜过完美计划。",
  "相信流程，但关键处要核实。",
  "善意和严格可以同桌。",
  "觉得重，就从两分钟能开始的小事做起。",
  "你的标准会抬高整个团队。",
  "好奇，是带着笔记本的勇气。",
  "先交付价值，再打磨——顺序很重要。",
  "事实变了，改变主意是允许的。",
  "沉默不等于同意，主动听听反对意见。",
  "卓越，是把最后 10% 做完的习惯。",
  "今天很适合帮别人挪开一块绊脚石。",
  "连续诚实面对工作，就会积累动量。",
  "把最重要的事，一直放在最重要位置。",
  "短站会能省下长救火。",
  "注意力是最稀缺的货币，花得聪明些。",
  "把风险写下来，它在纸上会变小。",
  "下班前留一个干净交接，未来的你会感谢。",
] as const;

function stableIndex(seed: string, len: number) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % len;
}

/** One pep talk per user per calendar day (UTC), deterministic. */
export function companionPepTalkForDay(locale: Locale, userId: string, day = new Date()): string {
  const ymd = day.toISOString().slice(0, 10);
  const pool = locale === "zh" ? PEP_ZH : PEP_EN;
  const i = stableIndex(`${userId}:${ymd}`, pool.length);
  return pool[i] ?? pool[0];
}
