// Помощник по уведомлению о зарубежном счёте: срок + напоминания (.ics). Всё в браузере.
import { noticeDeadline, icsCalendar } from './zs-calc.js';

const f = document.getElementById('notice-form');
const out = document.getElementById('deadline');
const btn = document.getElementById('ics');
const fmt = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const WHAT = { open: 'об открытии счёта', close: 'о закрытии счёта', change: 'об изменении реквизитов' };
let events = [];

function update() {
  const date = f.date.value;
  if (!date) { out.textContent = ''; btn.disabled = true; return; }
  const due = noticeDeadline(date);
  const bank = f.bank.value.trim();
  out.textContent = `Подайте уведомление ${WHAT[f.kind.value]} не позднее ${fmt(due)}`;
  events = [{ date: due, title: `Уведомить ФНС ${WHAT[f.kind.value]}${bank ? ` (${bank})` : ''}`, note: 'Крайний срок — не позднее одного месяца со дня события. Подать можно в личном кабинете налогоплательщика.' }];
  if (f.kind.value !== 'change') {
    const year = Number(date.slice(0, 4)) + 1;
    events.push({ date: `${year}-05-15`, title: `Отчёт о движении средств по зарубежному счёту за ${year - 1} год${bank ? ` (${bank})` : ''}`, note: `Срок — до 1 июня ${year}. Цифры по выпискам: https://saidovahliddin97-oss.github.io/Project-of-Money-/` });
  }
  btn.disabled = false;
}
f.addEventListener('input', update);
f.addEventListener('change', update);
btn.addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([icsCalendar(events)], { type: 'text/calendar;charset=utf-8' }));
  a.download = 'napominaniya-schet-za-rubezhom.ics';
  a.click();
});
