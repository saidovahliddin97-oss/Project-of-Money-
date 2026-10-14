// /unlock.html#<код> — сюда lava.top возвращает покупателя после оплаты.
import { unlockWithCode } from './zs-unlock.js';

const $ = (s) => document.querySelector(s);
async function apply(code) {
  const ok = await unlockWithCode(code);
  $('#title').textContent = ok ? 'Спасибо! Цифры открыты' : 'Код не подошёл';
  $('#msg').textContent = ok
    ? 'Доступ сохранён в этом браузере. Вернитесь к выпискам — таблица листа 3 теперь видна целиком.'
    : 'Проверьте ссылку или напишите на ahlak2049@gmail.com с email, указанным при оплате.';
  if (ok) $('#code-form').hidden = true;
}
$('#code-form').addEventListener('submit', (e) => { e.preventDefault(); apply(e.target.code.value); });
const fromHash = decodeURIComponent(location.hash.slice(1));
if (fromHash) apply(fromHash);
