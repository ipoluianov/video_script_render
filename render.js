// Вся логика рендера сценария и экспорта кадров
(function () {
  'use strict';

  const scriptEl = document.getElementById('script');
  const previewEl = document.getElementById('preview');
  const frameNumEl = document.getElementById('frameNum');
  const logEl = document.getElementById('log');
  const progressWrap = document.getElementById('progressWrap');
  const progressBar = document.getElementById('progressBar');
  const btnPlay = document.getElementById('btnPlay');
  const btnStop = document.getElementById('btnStop');

  function log(msg) {
    logEl.textContent += msg + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  }

  function clearLog() {
    logEl.textContent = '';
  }

  // --- Парсер скрипта ---
  const PRIMITIVES = {
    line: ['x1', 'y1', 'x2', 'y2', 'color', 'width'],
    rect: ['x', 'y', 'w', 'h', 'color', 'width'],
    fillrect: ['x', 'y', 'w', 'h', 'color'],
    roundrect: ['x', 'y', 'w', 'h', 'radius', 'color', 'width'],
    fillroundrect: ['x', 'y', 'w', 'h', 'radius', 'color'],
    circle: ['x', 'y', 'radius', 'color', 'width'],
    fillcircle: ['x', 'y', 'radius', 'color'],
    ellipse: ['x', 'y', 'rx', 'ry', 'color', 'width'],
    fillellipse: ['x', 'y', 'rx', 'ry', 'color'],
    arc: ['x', 'y', 'radius', 'startAngle', 'endAngle', 'color', 'width'],
    fillarc: ['x', 'y', 'radius', 'startAngle', 'endAngle', 'color'],
    ring: ['x', 'y', 'innerRadius', 'outerRadius', 'color', 'width'],
    fillring: ['x', 'y', 'innerRadius', 'outerRadius', 'color'],
    star: ['x', 'y', 'outerR', 'innerR', 'points', 'color', 'width'],
    fillstar: ['x', 'y', 'outerR', 'innerR', 'points', 'color'],
    triangle: ['x1', 'y1', 'x2', 'y2', 'x3', 'y3', 'color', 'width'],
    filltriangle: ['x1', 'y1', 'x2', 'y2', 'x3', 'y3', 'color'],
    quad: ['x0', 'y0', 'cx', 'cy', 'x1', 'y1', 'color', 'width'],
    cubic: ['x0', 'y0', 'c1x', 'c1y', 'c2x', 'c2y', 'x1', 'y1', 'color', 'width']
  };

  const ALL_PRIMITIVE_TYPES = ['line', 'rect', 'fillrect', 'roundrect', 'fillroundrect', 'circle', 'fillcircle', 'ellipse', 'fillellipse', 'arc', 'fillarc', 'ring', 'fillring', 'star', 'fillstar', 'triangle', 'filltriangle', 'quad', 'cubic'];

  function parseScript(text) {
    const settings = { width: 640, height: 480 };
    const keyframes = {}; // frameNum -> { id: { type, ...props } }
    const characters = {}; // name -> [ { id, type, ...relativeProps } ]
    const lines = text.split(/\r?\n/);
    let currentFrame = null;
    let currentCharacter = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Внутри блока character ... end: описания примитивов персонажа
      if (currentCharacter) {
        if (/^end\b/i.test(line)) {
          currentCharacter = null;
          continue;
        }
        const parts = line.split(',').map(s => s.trim());
        if (parts.length < 2) continue;
        const firstToken = parts[0].split(/\s+/);
        const cmd = (firstToken[0] || '').toLowerCase();
        const type = ALL_PRIMITIVE_TYPES.concat(['text', 'polygon', 'fillpolygon']).find(t => cmd === t);
        if (!type) continue;
        const id = firstToken[1] || parts[1];
        if (type === 'text') {
          const x = parseFloat(parts[2]) || 0, y = parseFloat(parts[3]) || 0;
          const color = (parts[4] || '#fff').trim();
          const size = parseFloat(parts[5]) || 16;
          const content = parts.slice(6).join(' ').trim();
          if (!characters[currentCharacter]) characters[currentCharacter] = [];
          characters[currentCharacter].push({ type: 'text', id, x, y, color, size, content });
          continue;
        }
        if (type === 'polygon' || type === 'fillpolygon') {
          const n = Math.max(0, parseInt(parts[1], 10) || 0);
          const points = [];
          for (let i = 0; i < n; i++) points.push({ x: parseFloat(parts[2 + i * 2]) || 0, y: parseFloat(parts[3 + i * 2]) || 0 });
          const color = (parts[2 + n * 2] || '#fff').trim();
          const width = type === 'polygon' ? (parseFloat(parts[3 + n * 2]) || 1) : 1;
          if (!characters[currentCharacter]) characters[currentCharacter] = [];
          characters[currentCharacter].push({ type, id, points, color, width });
          continue;
        }
        const keys = PRIMITIVES[type];
        const rest = parts.slice(1).map((s, idx) => {
          const k = keys[idx];
          if (k === 'color') return s;
          if (k === 'w' || k === 'h' || k === 'radius' || k === 'rx' || k === 'ry') return parseFloat(s) || 0;
          return parseFloat(s) || 0;
        });
        const props = { type, id };
        keys.forEach((k, idx) => { props[k] = rest[idx] ?? 0; });
        if (!characters[currentCharacter]) characters[currentCharacter] = [];
        characters[currentCharacter].push(props);
        continue;
      }

      // Начало описания персонажа
      const charDefMatch = line.match(/^character\s+(\w+)\s*:/i);
      if (charDefMatch) {
        const name = charDefMatch[1];
        if (!characters[name]) characters[name] = [];
        currentCharacter = name;
        continue;
      }

      const frameMatch = line.match(/^frame\s+(\d+)\s*:/i);
      if (frameMatch) {
        currentFrame = parseInt(frameMatch[1], 10);
        if (!keyframes[currentFrame]) keyframes[currentFrame] = {};
        continue;
      }

      if (line.toLowerCase().startsWith('settings')) {
        const parts = line.split(/\s+/);
        if (parts.length >= 3) {
          settings.width = parseInt(parts[1], 10) || 640;
          settings.height = parseInt(parts[2], 10) || 480;
        }
        continue;
      }

      const parts = line.split(',').map(s => s.trim());
      if (parts.length < 1) continue;

      const firstToken = parts[0].split(/\s+/);
      const cmd = (firstToken[0] || '').toLowerCase();

      // Экземпляр персонажа: char <name> <id>, x, y
      if (cmd === 'char') {
        const charName = firstToken[1];
        const id = firstToken[2] || parts[1];
        const x = parseFloat(parts[1]) || 0;
        const y = parseFloat(parts[2]) || 0;
        const frame = currentFrame !== null ? currentFrame : 0;
        if (!keyframes[frame]) keyframes[frame] = {};
        keyframes[frame][id] = { type: 'char', character: charName, x, y };
        continue;
      }

      if (cmd === 'text' && parts.length >= 6) {
        const id = firstToken[1] || parts[1];
        const x = parseFloat(parts[2]) || 0, y = parseFloat(parts[3]) || 0;
        const color = (parts[4] || '#fff').trim();
        const size = parseFloat(parts[5]) || 16;
        const content = parts.slice(6).join(' ').trim();
        const frame = currentFrame !== null ? currentFrame : 0;
        if (!keyframes[frame]) keyframes[frame] = {};
        keyframes[frame][id] = { type: 'text', id, x, y, color, size, content };
        continue;
      }
      if ((cmd === 'polygon' || cmd === 'fillpolygon') && parts.length >= 5) {
        const id = firstToken[1] || parts[1];
        const n = Math.max(0, parseInt(parts[1], 10) || 0);
        const points = [];
        for (let i = 0; i < n; i++) points.push({ x: parseFloat(parts[2 + i * 2]) || 0, y: parseFloat(parts[3 + i * 2]) || 0 });
        const color = (parts[2 + n * 2] || '#fff').trim();
        const width = cmd === 'polygon' ? (parseFloat(parts[3 + n * 2]) || 1) : 1;
        const frame = currentFrame !== null ? currentFrame : 0;
        if (!keyframes[frame]) keyframes[frame] = {};
        keyframes[frame][id] = { type: cmd, id, points, color, width };
        continue;
      }

      const type = ALL_PRIMITIVE_TYPES.find(t => cmd === t);
      if (!type) continue;

      if (parts.length < 2) continue;
      const id = firstToken[1] || parts[1];
      const keys = PRIMITIVES[type];
      const rest = parts.slice(1).map((s, idx) => {
        const k = keys[idx];
        if (k === 'color') return s;
        if (k === 'w' || k === 'h' || k === 'radius' || k === 'rx' || k === 'ry') return parseFloat(s) || 0;
        return parseFloat(s) || 0;
      });

      const props = { type };
      keys.forEach((k, idx) => { props[k] = rest[idx] ?? 0; });

      const frame = currentFrame !== null ? currentFrame : 0;
      if (!keyframes[frame]) keyframes[frame] = {};
      keyframes[frame][id] = props;
    }

    const frameNumbers = Object.keys(keyframes).map(Number).sort((a, b) => a - b);
    const maxFrame = frameNumbers.length ? Math.max(...frameNumbers) : 0;
    return { settings, keyframes, frameNumbers, maxFrame, characters };
  }

  // --- Интерполяция ---
  function hexToRgb(hex) {
    const m = (hex || '#000000').replace(/^#/, '').match(/.{2}/g);
    if (!m) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(m[0], 16), g: parseInt(m[1], 16), b: parseInt(m[2], 16) };
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpColor(hexA, hexB, t) {
    const a = hexToRgb(hexA), b = hexToRgb(hexB);
    return rgbToHex(lerp(a.r, b.r, t), lerp(a.g, b.g, t), lerp(a.b, b.b, t));
  }

  function getInterpolatedState(parsed, frame) {
    const { keyframes, frameNumbers, characters = {} } = parsed;
    const allIds = new Set();
    frameNumbers.forEach(f => Object.keys(keyframes[f] || {}).forEach(id => allIds.add(id)));
    const state = [];
    allIds.forEach(id => {
      let prevF = null, nextF = null;
      for (let i = frameNumbers.length - 1; i >= 0; i--) {
        if (frameNumbers[i] <= frame && (keyframes[frameNumbers[i]][id])) { prevF = frameNumbers[i]; break; }
      }
      for (let i = 0; i < frameNumbers.length; i++) {
        if (frameNumbers[i] >= frame && (keyframes[frameNumbers[i]][id])) { nextF = frameNumbers[i]; break; }
      }
      if (prevF === null) prevF = nextF;
      if (nextF === null) nextF = prevF;
      const prev = prevF != null ? keyframes[prevF][id] : null;
      const next = nextF != null ? keyframes[nextF][id] : null;
      if (!prev && !next) return;
      const use = prev || next;
      // Примитив без второго ключевого кадра или совпадающие кадры
      if (prevF === nextF || !prev || !next) {
        state.push({ id, ...use });
        return;
      }

      // Отдельная логика для персонажей (type === 'char'): интерполируем только позицию
      if (prev.type === 'char') {
        const tChar = (frame - prevF) / (nextF - prevF);
        state.push({
          id,
          type: 'char',
          character: prev.character,
          x: lerp(prev.x || 0, next.x || 0, tChar),
          y: lerp(prev.y || 0, next.y || 0, tChar)
        });
        return;
      }

      const t = (frame - prevF) / (nextF - prevF);
      const type = prev.type;
      if (type === 'text') {
        state.push({
          id, type: 'text',
          x: lerp(prev.x || 0, next.x || 0, t),
          y: lerp(prev.y || 0, next.y || 0, t),
          color: lerpColor(prev.color || '#000', next.color || '#000', t),
          size: lerp(Number(prev.size) || 16, Number(next.size) || 16, t),
          content: prev.content || next.content || ''
        });
        return;
      }
      if (type === 'polygon' || type === 'fillpolygon') {
        const pp = prev.points || [], np = next.points || [];
        const n = Math.max(pp.length, np.length);
        const points = [];
        for (let i = 0; i < n; i++) {
          points.push({
            x: lerp(pp[i]?.x ?? np[i]?.x ?? 0, np[i]?.x ?? pp[i]?.x ?? 0, t),
            y: lerp(pp[i]?.y ?? np[i]?.y ?? 0, np[i]?.y ?? pp[i]?.y ?? 0, t)
          });
        }
        state.push({ id, type, points, color: lerpColor(prev.color || '#000', next.color || '#000', t), width: lerp(Number(prev.width) || 1, Number(next.width) || 1, t) });
        return;
      }
      const keys = PRIMITIVES[type];
      const props = { type, id };
      keys.forEach(k => {
        if (k === 'color') props[k] = lerpColor(prev[k] || '#000', next[k] || '#000', t);
        else props[k] = lerp(Number(prev[k]) || 0, Number(next[k]) || 0, t);
      });
      state.push(props);
    });

    // Разворачиваем персонажей в реальные примитивы
    const finalState = [];
    state.forEach(item => {
      if (item.type !== 'char') {
        finalState.push(item);
        return;
      }
      const tpl = characters[item.character];
      if (!tpl || !tpl.length) return;
      tpl.forEach(base => {
        if (base.type === 'text') {
          finalState.push({
            type: 'text',
            id: item.id + '_' + base.id,
            x: (base.x || 0) + (item.x || 0),
            y: (base.y || 0) + (item.y || 0),
            color: base.color,
            size: base.size,
            content: base.content || ''
          });
          return;
        }
        if (base.type === 'polygon' || base.type === 'fillpolygon') {
          const points = (base.points || []).map(p => ({ x: (p.x || 0) + (item.x || 0), y: (p.y || 0) + (item.y || 0) }));
          finalState.push({ type: base.type, id: item.id + '_' + base.id, points, color: base.color, width: base.width });
          return;
        }
        const keys = PRIMITIVES[base.type];
        const inst = { type: base.type, id: item.id + '_' + base.id };
        keys.forEach(k => {
          let v = base[k];
          if (k === 'x' || k === 'x1' || k === 'x2') v = (v || 0) + (item.x || 0);
          else if (k === 'y' || k === 'y1' || k === 'y2') v = (v || 0) + (item.y || 0);
          inst[k] = v;
        });
        finalState.push(inst);
      });
    });

    return finalState;
  }

  // --- Рендер на canvas ---
  function drawRoundRectPath(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
  }

  function drawEllipsePath(ctx, x, y, rx, ry) {
    if (typeof ctx.ellipse === 'function') {
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.restore();
  }

  function render(ctx, state, width, height) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    const ordered = (state || []).slice();
    ordered.sort((a, b) => {
      const z = (id) => (id === 'rb' || id === 'rh' ? 0 : id === 'ground' ? 1 : 2);
      return z(a.id) - z(b.id);
    });
    ordered.forEach(item => {
      const c = item.color || '#ffffff';
      const w = item.width != null ? item.width : 1;
      if (item.type === 'line') {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(item.x1, item.y1);
        ctx.lineTo(item.x2, item.y2);
        ctx.stroke();
      } else if (item.type === 'rect') {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.strokeRect(item.x, item.y, item.w, item.h);
      } else if (item.type === 'fillrect') {
        ctx.fillStyle = c;
        ctx.fillRect(item.x, item.y, item.w, item.h);
      } else if (item.type === 'roundrect') {
        const r = Math.max(0, Number(item.radius) || 0);
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        drawRoundRectPath(ctx, item.x, item.y, item.w, item.h, r);
        ctx.stroke();
      } else if (item.type === 'fillroundrect') {
        const r = Math.max(0, Number(item.radius) || 0);
        ctx.fillStyle = c;
        ctx.beginPath();
        drawRoundRectPath(ctx, item.x, item.y, item.w, item.h, r);
        ctx.fill();
      } else if (item.type === 'circle') {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (item.type === 'fillcircle') {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (item.type === 'ellipse') {
        const rx = Math.max(0, Number(item.rx) || 0);
        const ry = Math.max(0, Number(item.ry) || 0);
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        drawEllipsePath(ctx, item.x, item.y, rx, ry);
        ctx.stroke();
      } else if (item.type === 'fillellipse') {
        const rx = Math.max(0, Number(item.rx) || 0);
        const ry = Math.max(0, Number(item.ry) || 0);
        ctx.fillStyle = c;
        ctx.beginPath();
        drawEllipsePath(ctx, item.x, item.y, rx, ry);
        ctx.fill();
      } else if (item.type === 'arc') {
        const r = Math.max(0, Number(item.radius) || 0);
        const start = (Number(item.startAngle) || 0) * Math.PI / 180;
        const end = (Number(item.endAngle) || 360) * Math.PI / 180;
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(item.x, item.y, r, start, end);
        ctx.stroke();
      } else if (item.type === 'fillarc') {
        const r = Math.max(0, Number(item.radius) || 0);
        const start = (Number(item.startAngle) || 0) * Math.PI / 180;
        const end = (Number(item.endAngle) || 360) * Math.PI / 180;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(item.x, item.y);
        ctx.arc(item.x, item.y, r, start, end);
        ctx.closePath();
        ctx.fill();
      } else if (item.type === 'ring') {
        const ir = Math.max(0, Number(item.innerRadius) || 0);
        const or = Math.max(ir, Number(item.outerRadius) || 0);
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(item.x, item.y, ir, 0, Math.PI * 2);
        ctx.arc(item.x, item.y, or, Math.PI * 2, 0, true);
        ctx.closePath();
        ctx.stroke();
      } else if (item.type === 'fillring') {
        const ir = Math.max(0, Number(item.innerRadius) || 0);
        const or = Math.max(ir, Number(item.outerRadius) || 0);
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(item.x, item.y, or, 0, Math.PI * 2);
        ctx.arc(item.x, item.y, ir, Math.PI * 2, 0, true);
        ctx.fill('evenodd');
      } else if (item.type === 'star') {
        const pts = starPoints(item.x, item.y, Number(item.outerR) || 0, Number(item.innerR) || 0, Math.max(2, parseInt(item.points, 10) || 5));
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        pts.forEach((p, i) => { if (i > 0) ctx.lineTo(p.x, p.y); });
        ctx.closePath();
        ctx.stroke();
      } else if (item.type === 'fillstar') {
        const pts = starPoints(item.x, item.y, Number(item.outerR) || 0, Number(item.innerR) || 0, Math.max(2, parseInt(item.points, 10) || 5));
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        pts.forEach((p, i) => { if (i > 0) ctx.lineTo(p.x, p.y); });
        ctx.closePath();
        ctx.fill();
      } else if (item.type === 'triangle') {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(item.x1, item.y1);
        ctx.lineTo(item.x2, item.y2);
        ctx.lineTo(item.x3, item.y3);
        ctx.closePath();
        ctx.stroke();
      } else if (item.type === 'filltriangle') {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(item.x1, item.y1);
        ctx.lineTo(item.x2, item.y2);
        ctx.lineTo(item.x3, item.y3);
        ctx.closePath();
        ctx.fill();
      } else if (item.type === 'quad') {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(item.x0, item.y0);
        ctx.quadraticCurveTo(item.cx, item.cy, item.x1, item.y1);
        ctx.stroke();
      } else if (item.type === 'cubic') {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(item.x0, item.y0);
        ctx.bezierCurveTo(item.c1x, item.c1y, item.c2x, item.c2y, item.x1, item.y1);
        ctx.stroke();
      } else if (item.type === 'text') {
        const size = Math.max(1, Number(item.size) || 16);
        ctx.font = size + 'px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = item.color || '#ffffff';
        ctx.fillText(item.content || '', item.x, item.y);
      } else if (item.type === 'polygon') {
        const pts = item.points || [];
        if (pts.length > 0) {
          ctx.strokeStyle = c;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.closePath();
          ctx.stroke();
        }
      } else if (item.type === 'fillpolygon') {
        const pts = item.points || [];
        if (pts.length > 0) {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.closePath();
          ctx.fill();
        }
      }
    });
  }

  function starPoints(cx, cy, outerR, innerR, n) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i * Math.PI / n) - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return pts;
  }

  // --- Воспроизведение как видео (25 fps) ---
  const FPS = 25;
  let isPlaying = false;
  let playStartTime = 0;
  let playParsed = null;
  let playLastFrame = -1;

  function stopPlayback() {
    isPlaying = false;
    btnPlay.disabled = false;
    btnStop.disabled = true;
  }

  function playLoop(timestamp) {
    if (!isPlaying || !playParsed) return;
    if (!playStartTime) playStartTime = timestamp;
    const elapsedSec = (timestamp - playStartTime) / 1000;
    const frame = Math.floor(elapsedSec * FPS);
    const maxFrame = playParsed.maxFrame || 0;

    if (frame > maxFrame) {
      const lastState = getInterpolatedState(playParsed, maxFrame);
      const { width, height } = playParsed.settings;
      previewEl.width = width;
      previewEl.height = height;
      const ctx = previewEl.getContext('2d');
      render(ctx, lastState, width, height);
      frameNumEl.value = String(maxFrame);
      stopPlayback();
      return;
    }

    if (frame !== playLastFrame) {
      playLastFrame = frame;
      const state = getInterpolatedState(playParsed, frame);
      const { width, height } = playParsed.settings;
      previewEl.width = width;
      previewEl.height = height;
      const ctx = previewEl.getContext('2d');
      render(ctx, state, width, height);
      frameNumEl.value = String(frame);
    }

    requestAnimationFrame(playLoop);
  }

  function startPlayback() {
    clearLog();
    try {
      playParsed = parseScript(scriptEl.value);
      if (!playParsed.frameNumbers.length) {
        log('Нет ключевых кадров для воспроизведения.');
        return;
      }
      isPlaying = true;
      playStartTime = 0;
      playLastFrame = -1;
      btnPlay.disabled = true;
      btnStop.disabled = false;
      log('Воспроизведение (25 fps)...');
      requestAnimationFrame(playLoop);
    } catch (e) {
      log('Ошибка: ' + e.message);
    }
  }

  function parseAndPreview(frameIndex) {
    if (isPlaying) stopPlayback();
    clearLog();
    try {
      const parsed = parseScript(scriptEl.value);
      const state = getInterpolatedState(parsed, frameIndex);
      const { width, height } = parsed.settings;
      previewEl.width = width;
      previewEl.height = height;
      const ctx = previewEl.getContext('2d');
      render(ctx, state, width, height);
      frameNumEl.max = parsed.maxFrame;
      log('Превью кадра ' + frameIndex + ', размер ' + width + '×' + height);
    } catch (e) {
      log('Ошибка: ' + e.message);
    }
  }

  function renderToZip() {
    if (isPlaying) stopPlayback();
    clearLog();
    const btn = document.getElementById('btnRender');
    btn.disabled = true;
    progressWrap.style.display = 'block';
    progressBar.style.width = '0%';

    try {
      const parsed = parseScript(scriptEl.value);
      const { settings, maxFrame } = parsed;
      const { width, height } = settings;
      const total = maxFrame + 1;
      log('Кадров: ' + total + ', размер ' + width + '×' + height);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const zip = new JSZip();

      const now = new Date();
      const pad2 = (n) => String(n).padStart(2, '0');
      const folderName = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate()) + '-' +
        pad2(now.getHours()) + '-' + pad2(now.getMinutes()) + '-' + pad2(now.getSeconds());
      const folder = zip.folder(folderName);

      const batLines = [
        '@echo off',
        'chcp 65001 >nul',
        'set FPS=25',
        'set PATTERN=frame_%%05d.png',
        'echo Creating video from PNG frames (%FPS% fps)...',
        'where ffmpeg >nul 2>&1',
        'if %errorlevel% neq 0 (echo Install ffmpeg and add to PATH: https://ffmpeg.org & pause & exit /b 1)',
        'echo.',
        'echo [1/3] MP4 (H.264)...',
        'ffmpeg -y -framerate %FPS% -i %PATTERN% -c:v libx264 -pix_fmt yuv420p output.mp4',
        'echo [2/3] WebM (VP9)...',
        'ffmpeg -y -framerate %FPS% -i %PATTERN% -c:v libvpx-vp9 -pix_fmt yuv420p output.webm',
        'echo [3/3] AVI (MPEG-4)...',
        'ffmpeg -y -framerate %FPS% -i %PATTERN% -c:v mpeg4 -pix_fmt yuv420p output.avi',
        'echo.',
        'echo Done: output.mp4, output.webm, output.avi',
        'pause'
      ];
      folder.file('make_video.bat', batLines.join('\r\n'));

      function doFrame(index) {
        if (index > maxFrame) {
          zip.generateAsync({ type: 'blob' }).then(blob => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'frames.zip';
            a.click();
            URL.revokeObjectURL(a.href);
            progressBar.style.width = '100%';
            log('Готово: frames.zip');
            btn.disabled = false;
          });
          return;
        }
        const state = getInterpolatedState(parsed, index);
        render(ctx, state, width, height);
        canvas.toBlob(blob => {
          if (!blob) {
            log('Ошибка: не удалось создать PNG для кадра ' + index);
          } else {
            folder.file('frame_' + String(index).padStart(5, '0') + '.png', blob);
          }
          progressBar.style.width = ((index + 1) / total * 100) + '%';
          setTimeout(() => doFrame(index + 1), 0);
        }, 'image/png', 1);
      }
      doFrame(0);
    } catch (e) {
      log('Ошибка: ' + e.message);
      btn.disabled = false;
      progressWrap.style.display = 'none';
    }
  }

  document.getElementById('btnPreview').addEventListener('click', () => parseAndPreview(parseInt(frameNumEl.value, 10) || 0));
  frameNumEl.addEventListener('change', () => parseAndPreview(parseInt(frameNumEl.value, 10) || 0));
  document.getElementById('btnRender').addEventListener('click', renderToZip);
  btnPlay.addEventListener('click', startPlayback);
  btnStop.addEventListener('click', stopPlayback);
  btnStop.disabled = true;

  parseAndPreview(0);
})();
