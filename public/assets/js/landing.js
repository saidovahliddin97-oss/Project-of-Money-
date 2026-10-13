import { initProDialog } from './pro.js';
import { stash } from './handoff.js';

const pro = initProDialog({ onActivated: () => (location.href = '/app.html') });
document.getElementById('buy-btn')?.addEventListener('click', () => pro.open(''));
document.getElementById('buy-bundle')?.addEventListener('click', () => pro.open('', { bundle: true }));

// Hero drop zone: keep the files in this browser and open the converter with them.
const drop = document.getElementById('home-drop');
if (drop) {
  const go = async (files) => {
    if (!files.length) return;
    drop.classList.add('drop');
    try {
      await stash(files);
      location.href = '/app.html#handoff';
    } catch {
      location.href = '/app.html';
    }
  };
  document.getElementById('home-file').addEventListener('change', (e) => go([...e.target.files]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); go([...e.dataTransfer.files]); });
}
