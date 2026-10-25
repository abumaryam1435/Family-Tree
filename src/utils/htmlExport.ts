import { Person } from '../types/family';
import { extractGivenName } from './nameUtils';

export interface ExportHtmlOptions {
  rootPerson: Person;
  rootPersons?: Person[];
  getChildren: (personId: string) => Person[];
  getAllPersons: () => Person[];
  mode?: 'classic' | 'classic_vertical';
  includeFemales?: boolean;
}

export function generateTreeInteractiveHtmlBlob(options: ExportHtmlOptions): {
  blob: Blob;
  filename: string;
  rootFirstName: string;
} {
  const {
    rootPerson,
    rootPersons,
    getChildren,
    mode = 'classic',
    includeFemales = false
  } = options;

  const selectedRoots =
    rootPersons && rootPersons.length > 0 ? rootPersons : [rootPerson];

  // Collect all reachable descendants starting from all selected roots
  const visited = new Set<string>();
  const familyList: Array<{
    id: string;
    fullName: string;
    firstName: string;
    gender: 'male' | 'female';
    fatherId?: string | null;
    motherId?: string | null;
    notes?: string;
  }> = [];

  function collect(person: Person) {
    if (visited.has(person.id)) return;
    visited.add(person.id);

    familyList.push({
      id: person.id,
      fullName: person.fullName,
      firstName: extractGivenName(person.fullName),
      gender: person.gender,
      fatherId: person.fatherId,
      motherId: person.motherId,
      notes: person.notes
    });

    const children = getChildren(person.id);
    for (const child of children) {
      collect(child);
    }
  }

  for (const r of selectedRoots) {
    collect(r);
  }

  const rootFirstName =
    selectedRoots.length === 1
      ? extractGivenName(selectedRoots[0].fullName)
      : `مجمعة_${selectedRoots.length}_أشجار`;
  const totalCount = familyList.length;
  const modeLabel = mode === 'classic_vertical' ? 'الهرمي عمود' : 'الهرمي صفوف';

  const htmlContent = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
  <title>شجرة العائلة التفاعلية (${modeLabel}) — أصل الشجرة: ${rootFirstName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; }
    body {
      font-family: 'Cairo', system-ui, -apple-system, sans-serif;
      background: #FAF8F5;
      color: #0f172a;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      touch-action: none;
    }
    .header-bar {
      position: absolute;
      top: 10px;
      right: 10px;
      left: 10px;
      z-index: 100;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(15, 76, 58, 0.2);
      border-radius: 16px;
      padding: 8px 14px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.08);
      max-width: 1300px;
      margin: 0 auto;
    }
    .title-group { display: flex; align-items: center; gap: 8px; }
    .badge-icon {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      background: #0F4C3A;
      color: #FDE68A;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: bold;
      flex-shrink: 0;
    }
    .app-title { font-size: 14px; font-weight: 800; color: #0F4C3A; line-height: 1.2; }
    .app-subtitle { font-size: 11px; color: #64748b; font-weight: 600; }
    .controls-group { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
    .btn {
      padding: 5px 11px;
      border-radius: 9px;
      border: 1px solid #e2e8f0;
      background: #ffffff;
      color: #0f172a;
      font-family: inherit;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s ease;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      white-space: nowrap;
    }
    .btn:hover { background: #f8fafc; border-color: #cbd5e1; }
    .btn-primary { background: #0F4C3A; color: #ffffff; border-color: #0F4C3A; }
    .btn-primary:hover { background: #0c3c2e; }
    .btn-gold { background: #FEF3C7; color: #92400E; border-color: #FCD34D; }
    .btn-gold:hover { background: #FDE68A; }
    .btn-rose { background: #FFF1F2; color: #9F1239; border-color: #FECDD3; }
    .btn-rose:hover { background: #FFE4E6; border-color: #FDA4AF; }
    .btn-rose.active { background: #E11D48; color: #ffffff; border-color: #BE123C; }
    .btn-rose.active:hover { background: #BE123C; }
    .search-input {
      padding: 5px 10px;
      border-radius: 9px;
      border: 1px solid #cbd5e1;
      font-family: inherit;
      font-size: 11px;
      width: 130px;
      outline: none;
      background: #ffffff;
    }
    .search-input:focus { border-color: #0F4C3A; box-shadow: 0 0 0 2px rgba(15, 76, 58, 0.15); }

    @media (max-width: 640px) {
      .header-bar {
        top: 6px;
        right: 6px;
        left: 6px;
        padding: 6px 8px;
        border-radius: 12px;
        gap: 5px;
      }
      .badge-icon {
        width: 26px;
        height: 26px;
        font-size: 14px;
        border-radius: 8px;
      }
      .title-group { gap: 6px; }
      .app-title {
        font-size: 12px;
        max-width: 190px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .app-subtitle { display: none; }
      .controls-group {
        width: 100%;
        gap: 3.5px;
        justify-content: space-between;
      }
      .search-input {
        width: 80px;
        flex: 1;
        min-width: 60px;
        padding: 4px 6px;
        font-size: 10px;
        border-radius: 7px;
      }
      .btn {
        padding: 4px 6px;
        font-size: 10px;
        border-radius: 7px;
        gap: 2px;
      }
      .btn-text-full { display: none; }
      .btn-text-short { display: inline; }
      .footer-hint { display: none; }
    }
    @media (min-width: 641px) {
      .btn-text-short { display: none; }
    }

    #viewport {
      width: 100vw;
      height: 100vh;
      position: relative;
      overflow: hidden;
      cursor: grab;
      direction: ltr;
      background-image: radial-gradient(rgba(15, 76, 58, 0.08) 1px, transparent 1px);
      background-size: 24px 24px;
    }
    #viewport:active { cursor: grabbing; }
    #transform-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: max-content;
      transform-origin: 0 0;
      will-change: transform;
      padding: 120px 80px 100px 80px;
    }
    #svg-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
    }
    #tree-container {
      position: relative;
      z-index: 2;
      direction: rtl;
      width: max-content;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .node-group {
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
    }
    .node-card {
      width: 175px;
      padding: 6px 10px;
      border-radius: 12px;
      background: #ffffff;
      border: 2.5px solid #0F4C3A;
      box-shadow: 0 4px 12px rgba(0,0,0,0.06);
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
      text-align: center;
    }
    .node-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.1); }
    .node-card.root-card {
      background: linear-gradient(135deg, #3E2410 0%, #063B2C 100%);
      color: #ffffff;
      border-color: #F59E0B;
      border-width: 3.5px;
    }
    .node-card.female-card { border-color: #BE123C; background: #FFF1F2; }
    .node-card.highlighted { border-color: #F59E0B; animation: pulse 1s infinite alternate; }
    
    .node-badges { display: flex; justify-content: space-between; font-size: 9px; font-weight: 700; margin-bottom: 4px; }
    .node-gen { color: #475569; }
    .node-card.root-card .node-gen { color: #FDE68A; }
    .node-gender-male { color: #047857; }
    .node-gender-female { color: #BE123C; }
    .node-card.root-card .node-gender-male { color: #FDE68A; }
    
    .node-divider { height: 1px; background: rgba(0,0,0,0.1); margin: 3px 0 5px 0; }
    .node-card.root-card .node-divider { background: rgba(253, 230, 138, 0.3); }

    .node-name {
      font-size: 21px;
      font-weight: 900;
      color: #000000;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .node-card.root-card .node-name { color: #ffffff; }

    .expand-btn {
      margin-top: 6px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 8px;
      background: #F1F5F9;
      color: #0F4C3A;
      border: 1px solid #CBD5E1;
      transition: all 0.15s ease;
    }
    .expand-btn:hover { background: #E2E8F0; }
    .node-card.root-card .expand-btn { background: rgba(255,255,255,0.2); color: #ffffff; border-color: rgba(255,255,255,0.4); }

    .children-container {
      display: flex;
      gap: 28px;
      margin-top: 48px;
      position: relative;
      transition: all 0.25s ease;
    }
    .children-container.vertical-stack {
      flex-direction: column;
      gap: 18px;
      margin-top: 24px;
    }
    .children-container.collapsed { display: none; }

    .footer-hint {
      position: absolute;
      bottom: 14px;
      right: 14px;
      z-index: 100;
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(6px);
      padding: 8px 14px;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      font-size: 11px;
      font-weight: 700;
      color: #475569;
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }

    @keyframes pulse {
      from { transform: scale(1); }
      to { transform: scale(1.05); }
    }
  </style>
</head>
<body>

  <div class="header-bar">
    <div class="title-group">
      <div class="badge-icon">🌳</div>
      <div>
        <div class="app-title">شجرة العائلة التفاعلية (${modeLabel}) — أصل الشجرة: ${rootFirstName}</div>
        <div id="app-subtitle" class="app-subtitle">${includeFemales ? `${totalCount} فرداً موثقاً (الذكور والإناث) · اضغط على أي بطاقة لتوسيع أو طي فروعها` : 'عرض الذكور فقط افتراضياً · اضغط «إظهار البنات» لعرض الإناث'}</div>
      </div>
    </div>

    <div class="controls-group">
      <input type="text" id="search-input" class="search-input" placeholder="بحث..." oninput="onSearchInput(this.value)">
      <button id="toggle-mode-btn" class="btn btn-gold" onclick="toggleDisplayMode()" title="التبديل بين الهرمي صفوف والهرمي عمود">
        <span id="toggle-mode-text">${mode === 'classic_vertical' ? 'هرمي صفوف' : 'هرمي عمود'}</span>
      </button>
      <button id="toggle-females-btn" class="btn btn-rose${includeFemales ? ' active' : ''}" onclick="toggleFemales()" title="إظهار أو إخفاء الإناث (البنات) في الشجرة">
        <span id="toggle-females-text-full" class="btn-text-full">${includeFemales ? 'إخفاء البنات' : 'إظهار البنات'}</span>
        <span id="toggle-females-text-short" class="btn-text-short">${includeFemales ? 'إخفاء البنات' : 'إظهار البنات'}</span>
      </button>
      <button class="btn btn-gold" onclick="expandAll()" title="توسيع جميع الفروع">
        <span>➕</span>
        <span class="btn-text-full">توسيع الكل</span>
        <span class="btn-text-short">توسيع</span>
      </button>
      <button class="btn" onclick="collapseAll()" title="طي جميع الفروع">
        <span>➖</span>
        <span class="btn-text-full">طي الكل</span>
        <span class="btn-text-short">طي</span>
      </button>
      <button class="btn btn-primary" onclick="resetCamera()" title="احتواء وتوسيط الشجرة">
        <span>🎯</span>
        <span class="btn-text-full">توسيط الشجرة</span>
        <span class="btn-text-short">توسيط</span>
      </button>
      <button class="btn" onclick="zoomStep(0.2)" title="تكبير">+</button>
      <button class="btn" onclick="zoomStep(-0.2)" title="تصغير">-</button>
    </div>
  </div>

  <div id="viewport" dir="ltr">
    <div id="transform-layer">
      <svg id="svg-layer"></svg>
      <div id="tree-container" dir="rtl"></div>
    </div>
  </div>

  <div class="footer-hint">
    💡 انقر على البطاقة لتوسيع/طي تفريعاتها المباشرة · اسحب الشاشة للتحريك
  </div>

  <script>
    const familyData = ${JSON.stringify(familyList, null, 2)};
    const rootId = "${rootPerson.id}";
    const rootIds = ${JSON.stringify(selectedRoots.map((r) => r.id))};
    const rootIdSet = new Set(rootIds);
    let displayMode = "${mode}";
    let showFemales = ${includeFemales ? 'true' : 'false'};

    const GEN_PALETTE = [
      { bg: 'linear-gradient(135deg, #093829 0%, #0F4C3A 100%)', border: '#D4AF37', text: '#FFFFFF', badge: '#FDE68A' },
      { bg: '#ECFDF5', border: '#059669', text: '#064E3B', badge: '#047857' },
      { bg: '#FFFBEB', border: '#D97706', text: '#78350F', badge: '#B45309' },
      { bg: '#EFF6FF', border: '#2563EB', text: '#1E3A8A', badge: '#1D4ED8' },
      { bg: '#F5F3FF', border: '#7C3AED', text: '#4C1D95', badge: '#6D28D9' },
      { bg: '#ECFEFF', border: '#0891B2', text: '#164E63', badge: '#0E7490' },
      { bg: '#FFF1F2', border: '#E11D48', text: '#881337', badge: '#BE123C' }
    ];

    const personMap = new Map();
    const childrenMap = new Map();

    familyData.forEach(p => {
      personMap.set(p.id, p);
      if (p.fatherId) {
        if (!childrenMap.has(p.fatherId)) childrenMap.set(p.fatherId, []);
        childrenMap.get(p.fatherId).push(p);
      }
    });

    function getVisibleKids(personId) {
      const allKids = childrenMap.get(personId) || [];
      return showFemales ? allKids : allKids.filter(k => k.gender === 'male');
    }

    function toggleDisplayMode() {
      displayMode = displayMode === 'classic_vertical' ? 'classic' : 'classic_vertical';
      const modeTxt = document.getElementById('toggle-mode-text');
      if (modeTxt) {
        modeTxt.textContent = displayMode === 'classic_vertical' ? 'هرمي صفوف' : 'هرمي عمود';
      }
      renderTree();
      setTimeout(resetCamera, 60);
    }

    function toggleFemales() {
      showFemales = !showFemales;
      const btn = document.getElementById('toggle-females-btn');
      const txtFull = document.getElementById('toggle-females-text-full');
      const txtShort = document.getElementById('toggle-females-text-short');
      const sub = document.getElementById('app-subtitle');
      if (showFemales) {
        btn.classList.add('active');
        txtFull.textContent = 'إخفاء البنات';
        txtShort.textContent = 'إخفاء البنات';
        if (sub) sub.textContent = '${totalCount} فرداً موثقاً (الذكور والإناث) · اضغط على أي بطاقة لتوسيع أو طي فروعها';
      } else {
        btn.classList.remove('active');
        txtFull.textContent = 'إظهار البنات';
        txtShort.textContent = 'إظهار البنات';
        if (sub) sub.textContent = 'عرض الذكور فقط افتراضياً · اضغط «إظهار البنات» لعرض الإناث';
      }
      renderTree();
      setTimeout(resetCamera, 60);
    }

    const collapsedSet = new Set();
    let camera = { x: 0, y: 0, zoom: 1 };
    let isDragging = false;
    let dragStart = { eX: 0, eY: 0, cX: 0, cY: 0 };

    const transformLayer = document.getElementById('transform-layer');
    const viewport = document.getElementById('viewport');
    const svgLayer = document.getElementById('svg-layer');
    const treeContainer = document.getElementById('tree-container');

    function applyTransform() {
      transformLayer.style.transform = "translate3d(" + camera.x + "px, " + camera.y + "px, 0) scale(" + camera.zoom + ")";
    }

    function resetCamera() {
      const vW = window.innerWidth;
      const vH = window.innerHeight;
      const cW = transformLayer.scrollWidth || transformLayer.offsetWidth || 1200;

      const fitZoom = vW < 768 ? Math.min(0.85, Math.max(0.28, (vW - 24) / Math.max(400, cW))) : 1;
      camera = {
        x: (vW - cW * fitZoom) / 2,
        y: vH < 640 ? 60 : 90,
        zoom: fitZoom
      };
      applyTransform();
    }

    function zoomStep(delta) {
      const oldZoom = camera.zoom;
      camera.zoom = Math.min(8.0, Math.max(0.15, camera.zoom + delta));
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      camera.x = cx - (cx - camera.x) * (camera.zoom / oldZoom);
      camera.y = cy - (cy - camera.y) * (camera.zoom / oldZoom);
      applyTransform();
    }

    function centerOnNode(personId) {
      setTimeout(() => {
        const nodeDom = document.querySelector('[data-id="' + personId + '"] > .node-card');
        if (!nodeDom) return;
        const cardRect = nodeDom.getBoundingClientRect();
        const vW = window.innerWidth;
        const vH = window.innerHeight;

        const cardX = cardRect.left + cardRect.width / 2;
        const cardY = cardRect.top + cardRect.height / 2;

        camera.x += (vW / 2) - cardX;
        camera.y += (vH / 2) - cardY;

        transformLayer.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
        applyTransform();

        setTimeout(() => {
          transformLayer.style.transition = 'none';
        }, 400);
      }, 60);
    }

    function toggleNode(personId, event) {
      if (event) event.stopPropagation();
      const kids = getVisibleKids(personId);
      if (kids.length === 0) return;

      const wasCollapsed = collapsedSet.has(personId);
      if (wasCollapsed) {
        collapsedSet.delete(personId);
      } else {
        collapsedSet.add(personId);
      }
      renderTree();

      if (wasCollapsed) {
        centerOnNode(personId);
      }
    }

    function expandAll() {
      collapsedSet.clear();
      renderTree();
    }

    function collapseAll() {
      collapsedSet.clear();
      familyData.forEach(p => {
        const kids = childrenMap.get(p.id) || [];
        if (kids.length > 0) {
          collapsedSet.add(p.id);
        }
      });
      renderTree();
      setTimeout(resetCamera, 60);
    }

    function buildNodeDom(person, depth) {
      const kids = getVisibleKids(person.id);
      const isCollapsed = collapsedSet.has(person.id);
      const isRoot = rootIdSet.has(person.id) || depth === 1;

      const groupDiv = document.createElement('div');
      groupDiv.className = 'node-group';
      groupDiv.dataset.id = person.id;

      const cardDiv = document.createElement('div');
      cardDiv.className = 'node-card' + (isRoot ? ' root-card' : person.gender === 'female' ? ' female-card' : '');
      if (displayMode === 'classic_vertical') {
        const pal = GEN_PALETTE[(depth - 1) % GEN_PALETTE.length];
        cardDiv.style.background = pal.bg;
        cardDiv.style.borderColor = pal.border;
      }
      cardDiv.onclick = (e) => toggleNode(person.id, e);

      const genLabel = isRoot ? 'الأصل الراسخ' : 'الجيل ' + depth;
      const genderLabel = person.gender === 'male' ? 'ذكر' : 'أنثى';

      let html = \`
        <div class="node-badges">
          <span class="node-gen">\${genLabel}</span>
          <span class="\${person.gender === 'female' ? 'node-gender-female' : 'node-gender-male'}">\${genderLabel}</span>
        </div>
        <div class="node-divider"></div>
        <div class="node-name">\${person.firstName}</div>
      \`;

      if (kids.length > 0) {
        const btnText = isCollapsed ? '➕ ' + kids.length + ' أفرع' : '➖ طي الأفرع';
        html += \`<div class="expand-btn">\${btnText}</div>\`;
      }

      cardDiv.innerHTML = html;
      groupDiv.appendChild(cardDiv);

      if (kids.length > 0) {
        const childrenDiv = document.createElement('div');
        const allLeafKids = displayMode === 'classic_vertical' && kids.length > 1 && kids.every(k => getVisibleKids(k.id).length === 0);
        childrenDiv.className = 'children-container' + (allLeafKids ? ' vertical-stack' : '') + (isCollapsed ? ' collapsed' : '');

        kids.forEach(kid => {
          childrenDiv.appendChild(buildNodeDom(kid, depth + 1));
        });

        groupDiv.appendChild(childrenDiv);
      }

      return groupDiv;
    }

    function drawConnectors() {
      svgLayer.innerHTML = '';
      const containerRect = transformLayer.getBoundingClientRect();
      const zoom = camera.zoom;

      function connectRecursive(parentGroup) {
        const kidsContainer = parentGroup.querySelector(':scope > .children-container');
        if (!kidsContainer || kidsContainer.classList.contains('collapsed')) return;

        const parentCard = parentGroup.querySelector(':scope > .node-card');
        const pRect = parentCard.getBoundingClientRect();
        const pX = (pRect.left + pRect.width / 2 - containerRect.left) / zoom;
        const pY = (pRect.bottom - containerRect.top) / zoom;

        const kidGroups = kidsContainer.querySelectorAll(':scope > .node-group');
        kidGroups.forEach(kidGroup => {
          const kidCard = kidGroup.querySelector(':scope > .node-card');
          const kRect = kidCard.getBoundingClientRect();
          const kX = (kRect.left + kRect.width / 2 - containerRect.left) / zoom;
          const kY = (kRect.top - containerRect.top) / zoom;

          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const midY = (pY + kY) / 2;
          const d = \`M \${pX} \${pY} L \${pX} \${midY} L \${kX} \${midY} L \${kX} \${kY}\`;
          path.setAttribute('d', d);
          path.setAttribute('stroke', '#0F4C3A');
          path.setAttribute('stroke-width', '3');
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('stroke-linejoin', 'round');
          svgLayer.appendChild(path);

          connectRecursive(kidGroup);
        });
      }

      const rootGroups = treeContainer.querySelectorAll(':scope > .node-group');
      rootGroups.forEach(rg => connectRecursive(rg));
    }

    function renderTree() {
      treeContainer.innerHTML = '';
      svgLayer.innerHTML = '';

      treeContainer.style.display = 'flex';
      treeContainer.style.flexDirection = displayMode === 'classic_vertical' && rootIds.length > 1 ? 'row' : 'column';
      treeContainer.style.alignItems = displayMode === 'classic_vertical' && rootIds.length > 1 ? 'flex-start' : 'center';
      treeContainer.style.gap = '72px';

      rootIds.forEach(rid => {
        const rp = personMap.get(rid);
        if (rp) {
          treeContainer.appendChild(buildNodeDom(rp, 1));
        }
      });

      requestAnimationFrame(() => {
        svgLayer.setAttribute('width', transformLayer.scrollWidth || transformLayer.offsetWidth);
        svgLayer.setAttribute('height', transformLayer.scrollHeight || transformLayer.offsetHeight);
        drawConnectors();
      });
    }

    function normalizeAr(str) {
      if (!str) return '';
      return str
        .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/[ىئ]/g, 'ي')
        .replace(/ؤ/g, 'و')
        .replace(/(^|\s)(الشيخ|العم|الدكتور|المهندس|الحاج|السيد|الشريف|أبو|ابو|أم|ام)\s+/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function tokenizeWords(normStr) {
      if (!normStr) return [];
      const connectors = new Set(['بن', 'بنت', 'ابن', 'ابنه']);
      return normStr.split(' ').filter(w => w.length > 0 && !connectors.has(w));
    }

    function scorePersonMatch(p, qTokens) {
      const words = tokenizeWords(normalizeAr(p.fullName));
      if (words.length < qTokens.length) return 0;
      const m = qTokens.length;
      const n = words.length;
      let best = 0;

      function searchAlign(qIdx, wStart, indices) {
        if (qIdx === m) {
          const start = indices[0];
          const span = indices[m - 1] - start + 1;
          const gaps = span - m;
          let tokScore = 0;
          for (let i = 0; i < m; i++) {
            const qt = qTokens[i];
            const tw = words[indices[i]];
            tokScore += tw === qt ? 300 : Math.round((qt.length / tw.length) * 200);
          }
          let s = 0;
          if (start === 0 && gaps === 0) s = 90000 + tokScore - (n - m) * 150;
          else if (start === 0) s = 75000 - gaps * 3500 + tokScore;
          else if (gaps === 0) s = 55000 - start * 3000 + tokScore;
          else s = 40000 - start * 2500 - gaps * 2500 + tokScore;
          if (s > best) best = s;
          return;
        }
        const rem = m - qIdx;
        for (let w = wStart; w <= n - rem; w++) {
          if (words[w].startsWith(qTokens[qIdx])) {
            indices.push(w);
            searchAlign(qIdx + 1, w + 1, indices);
            indices.pop();
          }
        }
      }
      searchAlign(0, 0, []);
      return best;
    }

    function onSearchInput(query) {
      const q = query.trim();
      document.querySelectorAll('.node-card').forEach(card => {
        card.classList.remove('highlighted');
      });
      if (!q) return;

      const qTokens = tokenizeWords(normalizeAr(q));
      if (qTokens.length === 0) return;

      const matches = familyData
        .map(p => ({ p, score: scorePersonMatch(p, qTokens) }))
        .filter(item => item.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.p.fullName.localeCompare(b.p.fullName, 'ar');
        });

      if (matches.length === 0) return;

      matches.forEach(({ p }) => {
        if (p.gender === 'female' && !showFemales) {
          toggleFemales();
        }
        let curr = p;
        while (curr && curr.fatherId) {
          collapsedSet.delete(curr.fatherId);
          curr = personMap.get(curr.fatherId);
        }
      });

      renderTree();

      setTimeout(() => {
        matches.forEach(({ p }) => {
          const group = document.querySelector(\`[data-id="\${p.id}"] > .node-card\`);
          if (group) group.classList.add('highlighted');
        });
      }, 50);
    }

    viewport.addEventListener('mousedown', (e) => {
      if (e.target.closest('button, input')) return;
      isDragging = true;
      dragStart = { eX: e.clientX, eY: e.clientY, cX: camera.x, cY: camera.y };
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      camera.x = dragStart.cX + (e.clientX - dragStart.eX);
      camera.y = dragStart.cY + (e.clientY - dragStart.eY);
      applyTransform();
    });

    window.addEventListener('mouseup', () => { isDragging = false; });

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = Math.exp(-e.deltaY * 0.0015);
      const oldZoom = camera.zoom;
      camera.zoom = Math.min(8.0, Math.max(0.15, camera.zoom * zoomFactor));

      const rect = viewport.getBoundingClientRect();
      const mX = e.clientX - rect.left;
      const mY = e.clientY - rect.top;

      camera.x = mX - (mX - camera.x) * (camera.zoom / oldZoom);
      camera.y = mY - (mY - camera.y) * (camera.zoom / oldZoom);
      applyTransform();
    }, { passive: false });

    let lastTouchDist = 0;
    viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        isDragging = true;
        dragStart = { eX: t.clientX, eY: t.clientY, cX: camera.x, cY: camera.y };
      } else if (e.touches.length === 2) {
        lastTouchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    }, { passive: true });

    viewport.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && isDragging) {
        const t = e.touches[0];
        camera.x = dragStart.cX + (t.clientX - dragStart.eX);
        camera.y = dragStart.cY + (t.clientY - dragStart.eY);
        applyTransform();
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (lastTouchDist > 0) {
          const factor = dist / lastTouchDist;
          zoomStep(factor > 1 ? 0.05 : -0.05);
        }
        lastTouchDist = dist;
      }
    }, { passive: true });

    viewport.addEventListener('touchend', () => { isDragging = false; });

    window.addEventListener('DOMContentLoaded', () => {
      renderTree();
      setTimeout(resetCamera, 100);
    });
  </script>
</body>
</html>`;

  const safeFilename = `شجرة_العائلة_التفاعلية_${rootFirstName}.html`.replace(/[\\/:*?"<>|]/g, '_');
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  return { blob, filename: safeFilename, rootFirstName };
}

export async function exportTreeToInteractiveHtml(options: ExportHtmlOptions): Promise<{
  blob: Blob;
  filename: string;
}> {
  const { blob, filename } = generateTreeInteractiveHtmlBlob(options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { blob, filename };
}
