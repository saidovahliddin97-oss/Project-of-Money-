import { initProDialog } from './pro.js';

const pro = initProDialog({ onActivated: () => (location.href = '/app.html') });
document.getElementById('buy-btn')?.addEventListener('click', () => pro.open(''));
