// dimuat saat pertama kali dibuka (lazy di ui/index.html); script biasa, berbagi scope global dengan index.html
// ---- statistik mingguan ----
async function openStats() {
  const days = await almac.ask('stats')
  const total = days.reduce((a, d) => a + d.n, 0), max = Math.max(1, ...days.map(d => d.n))
  openModal('This week', [
    el('div', { className: 'stats-hero' }, almiCanvas(total > 100 ? 'happy' : 'wave', 96, 4),
      el('p', { className: 'modal-text' }, el('b', { textContent: total.toLocaleString('en-US') }), ` ads & trackers blocked in the last 7 days. Almi is ${total > 1000 ? 'very full' : total > 100 ? 'well fed' : 'still hungry'}.`)),
    el('div', { className: 'stats-bars' }, ...days.map(d => el('div', { className: 'bar', title: `${d.day}: ${d.n}` },
      el('i', { style: `height:${Math.round(d.n / max * 100)}%` }),
      el('small', { textContent: new Date(d.day + 'T00:00').toLocaleDateString('en-US', { weekday: 'short' }) })))),
  ], [{ label: 'Nice', primary: true }])
}
