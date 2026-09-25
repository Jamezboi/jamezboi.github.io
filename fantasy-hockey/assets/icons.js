(() => {
  const paths = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    arrows:'<path d="m17 3 4 4-4 4"/><path d="M3 7h18"/><path d="m7 21-4-4 4-4"/><path d="M21 17H3"/>',
    activity:'<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    flask:'<path d="M9 3h6"/><path d="M10 3v5.5L5.4 16a3 3 0 0 0 2.5 5h8.2a3 3 0 0 0 2.5-5L14 8.5V3"/><path d="M7 15h10"/>',
    settings:'<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.7 1.7-.06-.06a1.7 1.7 0 0 0-1.88-.34l-.08.03a1.7 1.7 0 0 0-1.03 1.56V20h-2.4v-.17a1.7 1.7 0 0 0-1.03-1.56l-.08-.03a1.7 1.7 0 0 0-1.88.34l-.06.06-1.7-1.7.06-.06A1.7 1.7 0 0 0 8.4 15l-.03-.08A1.7 1.7 0 0 0 6.81 13.9H6.6v-2.4h.21a1.7 1.7 0 0 0 1.56-1.03L8.4 10a1.7 1.7 0 0 0-.34-1.88L8 8.06l1.7-1.7.06.06a1.7 1.7 0 0 0 1.88.34l.08-.03a1.7 1.7 0 0 0 1.03-1.56V5h2.4v.17a1.7 1.7 0 0 0 1.03 1.56l.08.03a1.7 1.7 0 0 0 1.88-.34l.06-.06 1.7 1.7-.06.06A1.7 1.7 0 0 0 19.4 10l.03.08A1.7 1.7 0 0 0 20.99 11h.21v2.4h-.21a1.7 1.7 0 0 0-1.56 1.03Z"/>',
    refresh:'<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9a9 9 0 0 1 14.7-3.4L23 10M1 14l4.8 4.4A9 9 0 0 0 20.5 15"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chevron:'<path d="m6 9 6 6 6-6"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    x:'<path d="M6 6l12 12M18 6 6 18"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    alert:'<path d="M10.3 3.1 2 17.6A2 2 0 0 0 3.7 20h16.6a2 2 0 0 0 1.7-2.4L13.7 3.1a2 2 0 0 0-3.4 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    trophy:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4"/>',
    radio:'<circle cx="12" cy="12" r="2"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M7.76 7.76a6 6 0 0 0 0 8.48M16.24 7.76a6 6 0 0 1 0 8.48"/>',
    chart:'<line x1="4" y1="19" x2="4" y2="5"/><line x1="4" y1="19" x2="20" y2="19"/><polyline points="7 16 11 12 14 15 19 9"/>',
    download:'<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    moon:'<path d="M20.5 14.5A8 8 0 1 1 9.5 3.5 6.5 6.5 0 0 0 20.5 14.5Z"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
    shield:'<path d="M12 22s8-3.8 8-10V5l-8-3-8 3v7c0 6.2 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    hockey:'<circle cx="12" cy="12" r="8"/><circle cx="9" cy="12" r="1"/><path d="M15 8l4 8"/><path d="M14 17 8 8"/>'
  };
  window.Icon = (name, cls='') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.activity}</svg>`;
})();
