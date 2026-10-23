/* global ICONS */
// Composants d'interface partagés : icônes, formats, notifications, menus et fenêtres modales.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));

const icon = (name, cls = '') => `<svg class="icon ${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;

const api = (channel, ...args) => window.launcher.call(channel, ...args);

const fileUrl = p => 'file:///' + p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:');

// ---------- Formats ----------

const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
const ago = (ts) => {
	if (!ts) return 'Jamais joué';
	const s = (ts - Date.now()) / 1000;
	const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
	for (const [u, sec] of units) if (Math.abs(s) >= sec) return rtf.format(Math.round(s / sec), u);
	return 'à l\'instant';
};

const playTime = (ms) => {
	const min = Math.floor((ms || 0) / 60000);
	if (min < 1) return 'moins d\'une minute';
	const h = Math.floor(min / 60);
	return h ? `${h} h ${String(min % 60).padStart(2, '0')}` : `${min} min`;
};

const compact = n => n == null ? '—' : new Intl.NumberFormat('fr', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const bytes = n => n < 1024 ? `${n} o` : n < 1048576 ? `${(n / 1024).toFixed(0)} Ko` : `${(n / 1048576).toFixed(1)} Mo`;
const dateFr = ts => ts ? new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

const COLORS = ['#1bd96a', '#4f9cff', '#ff7a45', '#c05cff', '#ff496e', '#ffc93c', '#2ec4d6'];
const colorFor = s => COLORS[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

// Vignette : image si disponible, sinon initiale colorée (repli aussi en cas d'image cassée).
const avatar = (src, name, cls = '') => {
	const letter = esc((String(name || '?').replace(/^\W+/, '')[0] || '?').toUpperCase());
	const fallback = `<span class="letter" style="color:${colorFor(name)}">${letter}</span>`;
	return `<div class="avatar ${cls}" data-letter="${letter}" data-color="${colorFor(name)}">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : fallback}</div>`;
};

document.addEventListener('error', (e) => {
	const img = e.target;
	if (img.tagName !== 'IMG') return;
	const box = img.closest('[data-letter]');
	if (box) box.innerHTML = `<span class="letter" style="color:${box.dataset.color}">${box.dataset.letter}</span>`;
	else img.remove();
}, true);

const stars = (rating) => {
	let out = '<span class="stars">';
	for (let i = 1; i <= 5; i++) out += `<span style="opacity:${rating >= i - 0.25 ? 1 : 0.25}">${icon('star')}</span>`;
	return out + '</span>';
};

// ---------- Notifications ----------

const toast = (message, { type = 'success', actions = [], timeout = 4500 } = {}) => {
	const el = document.createElement('div');
	el.className = `toast ${type}`;
	el.innerHTML = `${icon(type === 'error' ? 'circle-x' : type === 'info' ? 'info' : 'check')}
		<div class="grow"><div>${message}</div>${actions.length ? `<div class="actions">${actions.map((a, i) => `<button class="btn sm ${i === 0 ? 'primary' : ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}</div>
		<button class="icon-btn" data-close>${icon('x', 'sm')}</button>`;
	const close = () => el.remove();
	el.addEventListener('click', (e) => {
		const b = e.target.closest('button');
		if (!b) return;
		if (b.hasAttribute('data-close')) return close();
		const a = actions[+b.dataset.i];
		if (a) { close(); a.run(); }
	});
	$('#toasts').appendChild(el);
	// Pas plus de 4 notifications à l'écran : les plus anciennes disparaissent.
	const all = $$('#toasts .toast');
	for (const old of all.slice(0, Math.max(0, all.length - 4))) old.remove();
	if (timeout) setTimeout(close, actions.length ? timeout * 2 : timeout);
	return el;
};

const toastError = error => toast(esc(error.message || String(error)), { type: 'error', timeout: 7000 });

// ---------- Infobulles ----------

let tipEl = null;
document.addEventListener('mouseover', (e) => {
	const t = e.target.closest('[data-tip]');
	if (!t || !t.dataset.tip) { if (tipEl) { tipEl.remove(); tipEl = null; } return; }
	if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tooltip'; document.body.appendChild(tipEl); }
	tipEl.textContent = t.dataset.tip;
	const r = t.getBoundingClientRect();
	const pos = t.dataset.tipPos || 'right';
	const right = pos === 'right';
	tipEl.style.left = `${right ? r.right + 10 : Math.max(6, Math.min(window.innerWidth - tipEl.offsetWidth - 6, r.left + r.width / 2 - tipEl.offsetWidth / 2))}px`;
	tipEl.style.top = `${right ? r.top + r.height / 2 - tipEl.offsetHeight / 2 : pos === 'top' ? r.top - tipEl.offsetHeight - 8 : r.bottom + 8}px`;
});

// ---------- Menus contextuels ----------

let openMenuEl = null;
const closeMenu = () => { if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; } };

const menu = (anchor, items) => {
	closeMenu();
	const el = document.createElement('div');
	el.className = 'menu';
	el.innerHTML = items.map((it, i) => it === '-' ? '<div class="sep"></div>'
		: `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${icon(it.icon)}${esc(it.label)}</button>`).join('');
	document.body.appendChild(el);
	const r = anchor.getBoundingClientRect();
	const left = Math.min(r.right - el.offsetWidth, window.innerWidth - el.offsetWidth - 8);
	el.style.left = `${Math.max(8, left)}px`;
	el.style.top = `${r.bottom + el.offsetHeight + 6 > window.innerHeight ? r.top - el.offsetHeight - 6 : r.bottom + 6}px`;
	el.addEventListener('click', (e) => {
		const b = e.target.closest('button[data-i]');
		if (!b) return;
		closeMenu();
		items[+b.dataset.i].run();
	});
	openMenuEl = el;
};

document.addEventListener('mousedown', (e) => { if (openMenuEl && !openMenuEl.contains(e.target)) closeMenu(); });

// ---------- Fenêtres modales ----------

/**
 * Ouvre une fenêtre modale. `render(close)` renvoie le HTML du corps ;
 * `setup(el, close)` branche les événements. Renvoie une promesse résolue par close(valeur).
 */
const modal = ({ title, body, foot = '', setup = () => {}, width = 520 }) => new Promise((resolve) => {
	const layer = document.createElement('div');
	layer.className = 'modal-layer';
	layer.innerHTML = `<div class="modal" style="width:${width}px">
		<div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close>${icon('x')}</button></div>
		<div class="modal-body">${body}</div>
		${foot ? `<div class="modal-foot">${foot}</div>` : '<div style="height:18px"></div>'}
	</div>`;
	const close = (value = null) => { layer.remove(); document.removeEventListener('keydown', onKey); resolve(value); };
	const onKey = (e) => { if (e.key === 'Escape') close(null); };
	document.addEventListener('keydown', onKey);
	layer.addEventListener('mousedown', (e) => { if (e.target === layer) close(null); });
	layer.querySelector('[data-close]').addEventListener('click', () => close(null));
	document.body.appendChild(layer);
	setup(layer.querySelector('.modal'), close);
	const first = layer.querySelector('input:not([type=hidden])');
	if (first) first.focus();
});

const confirmModal = (title, message, { confirm = 'Confirmer', danger = false } = {}) => modal({
	title,
	body: `<p style="margin:0;line-height:1.5">${message}</p>`,
	foot: `<button class="btn" data-no>Annuler</button><button class="btn ${danger ? 'stop' : 'primary'}" data-yes>${esc(confirm)}</button>`,
	setup: (el, close) => {
		el.querySelector('[data-no]').onclick = () => close(false);
		el.querySelector('[data-yes]').onclick = () => close(true);
	},
});

const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// Nettoie le HTML d'une description de mod (balises et attributs autorisés uniquement).
const sanitize = (html) => {
	const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
	const ALLOWED = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'A', 'IMG', 'UL', 'OL', 'LI', 'SPAN', 'DIV', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'CODE', 'PRE', 'HR', 'TABLE', 'TR', 'TD', 'TH', 'TBODY', 'THEAD']);
	const walk = (node) => {
		for (const child of [...node.children]) {
			if (!ALLOWED.has(child.tagName)) {
				if (['SCRIPT', 'STYLE', 'IFRAME', 'NOSCRIPT', 'FORM', 'BUTTON', 'SVG'].includes(child.tagName)) child.remove();
				else { walk(child); child.replaceWith(...child.childNodes); }
				continue;
			}
			const src = child.getAttribute('data-src') || child.getAttribute('src');
			const href = child.getAttribute('href');
			for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
			if (child.tagName === 'IMG') {
				if (src && /^https:\/\//.test(src)) { child.setAttribute('src', src); child.setAttribute('loading', 'lazy'); } else child.remove();
			}
			if (child.tagName === 'A' && href && /^https?:\/\//.test(href)) child.setAttribute('data-external', href);
			walk(child);
		}
	};
	walk(doc.body.firstChild);
	return doc.body.firstChild.innerHTML;
};
